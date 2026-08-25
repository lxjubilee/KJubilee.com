// ============================================
        // ALBUM & TRACK DATA — sourced from cdn.jubileeverse.com
        // ============================================

        const CDN_BASE = '/cdn';

        // Populated by loadAlbumsFromCDN() at DOMContentLoaded. Album shape:
        // { code, name, artist, image, banner, year, listeners, tracks: [{ title, duration, mp3 }] }
        let albums = [];

        async function loadAlbumsFromCDN() {
            const idxRes = await fetch(`${CDN_BASE}/json/music-index.json`, { cache: 'no-store' });
            if (!idxRes.ok) throw new Error(`music-index.json HTTP ${idxRes.status}`);
            const idx = await idxRes.json();

            const built = [];
            for (const entry of (idx.albums || [])) {
                try {
                    const albRes = await fetch(entry.albumJsonPath, { cache: 'no-store' });
                    if (!albRes.ok) {
                        console.warn(`Skipping ${entry.albumCode}: HTTP ${albRes.status}`);
                        continue;
                    }
                    const a = await albRes.json();
                    const folder = entry.albumFolder;
                    built.push({
                        code: a.albumCode,
                        name: a.albumTitle,
                        artist: a.artist,
                        image: `${folder}/${a.coverImage}`,
                        banner: `${folder}/${a.artistBanner}`,
                        year: a.releaseDate ? new Date(a.releaseDate).getFullYear() : '',
                        listeners: '— monthly listeners',
                        tracks: (a.tracks || []).map(t => ({
                            title: t.songTitle,
                            duration: t.duration || '--:--',
                            mp3: `${folder}/${t.mp3File}`
                        }))
                    });
                } catch (e) {
                    console.error(`Album load failed: ${entry.albumCode}`, e);
                }
            }
            albums = built;
        }


        // State
        let currentAlbumIdx = -1;
        let currentTrackIdx = -1;
        let isPlaying = false;
        let isShuffled = false;
        let isRepeating = false;

        // Followed albums (server-backed, logged-in users only). Set of album_id slugs.
        let userFollowedAlbums = new Set();

        // ============================================
        // AUTH + FOLLOW HELPERS (mirrors radio.html)
        // ============================================

        function getAuthData() {
            try {
                const authStr = localStorage.getItem('jubileeVerseAuth');
                if (!authStr) return null;
                const parsed = JSON.parse(authStr);
                return parsed.authenticated ? parsed : null;
            } catch { return null; }
        }

        function getAuthHeaders() {
            const authData = getAuthData();
            const token = authData?.token || authData?.tokens?.access;
            if (!token) return {};
            return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        }

        function requireLogin(actionLabel = 'continue') {
            const overlay = document.getElementById('authPromptOverlay');
            const action  = document.getElementById('authPromptAction');
            const signIn  = document.getElementById('authPromptSignIn');
            const signUp  = document.getElementById('authPromptSignUp');
            if (!overlay || !action || !signIn || !signUp) return;
            action.textContent = actionLabel;
            const here = encodeURIComponent(window.location.pathname + window.location.search);
            signIn.href = `/login.html?redirect=${here}`;
            signUp.href = `/signup.html?redirect=${here}`;
            overlay.classList.add('open');
            document.addEventListener('keydown', escDismissAuthPrompt);
        }
        function closeAuthPrompt() {
            const overlay = document.getElementById('authPromptOverlay');
            if (overlay) overlay.classList.remove('open');
            document.removeEventListener('keydown', escDismissAuthPrompt);
        }
        function escDismissAuthPrompt(e) {
            if (e.key === 'Escape') closeAuthPrompt();
        }

        // Stable identifier per album. Slug from name + artist; static array order
        // is incidental, so a slug survives any future reordering.
        function albumIdFor(idx) {
            const a = albums[idx];
            return (a.name + '-' + a.artist).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        }
        function albumIdxBySlug(slug) {
            for (let i = 0; i < albums.length; i++) {
                if (albumIdFor(i) === slug) return i;
            }
            return -1;
        }

        async function loadUserFollowedAlbums() {
            userFollowedAlbums.clear();
            const authData = getAuthData();
            if (!authData) {
                renderPopularSidebar();
                return;
            }
            try {
                const res = await fetch('/api/music/follows', { headers: getAuthHeaders() });
                if (!res.ok) throw new Error('Failed to load follows');
                const data = await res.json();
                if (data.success && Array.isArray(data.follows)) {
                    data.follows.forEach(f => userFollowedAlbums.add(f.album_id));
                }
            } catch (err) {
                console.error('[Album Follows] load error:', err);
            }
            renderPopularSidebar();
            updateFollowButtonState();
        }

        function updateFollowButtonState() {
            const btn = document.getElementById('followBtn');
            if (!btn || currentAlbumIdx < 0) return;
            const isFollowing = userFollowedAlbums.has(albumIdFor(currentAlbumIdx));
            btn.classList.toggle('following', isFollowing);
            btn.textContent = isFollowing ? 'Following' : 'Follow';
        }

        // ============================================
        // AUDIO PLAYBACK — streams MP3 from cdn.jubileeverse.com
        // ============================================

        let audioEl = null;
        let audioVolume = 0.7;

        function ensureAudio() {
            if (!audioEl) {
                audioEl = new Audio();
                audioEl.preload = 'metadata';
                audioEl.volume = audioVolume;
                audioEl.addEventListener('timeupdate', onAudioTimeUpdate);
                audioEl.addEventListener('loadedmetadata', onAudioLoadedMetadata);
                audioEl.addEventListener('ended', onAudioEnded);
                audioEl.addEventListener('error', () => console.warn('Audio error', audioEl.error));
            }
            return audioEl;
        }

        function startAudioPlayback(albumIdx, trackIdx) {
            const track = albums[albumIdx] && albums[albumIdx].tracks[trackIdx];
            if (!track || !track.mp3) return;
            const a = ensureAudio();
            a.src = track.mp3;
            a.currentTime = 0;
            a.play().catch(err => console.warn('Playback blocked until user gesture:', err.message));
        }

        function stopAudioPlayback() { if (audioEl) audioEl.pause(); }
        function resumeAudioPlayback() { if (audioEl) audioEl.play().catch(()=>{}); }
        function setAudioVolume(vol) {
            audioVolume = Math.max(0, Math.min(1, vol));
            if (audioEl) audioEl.volume = audioVolume;
        }

        function formatTime(sec) {
            if (!isFinite(sec) || sec < 0) return '0:00';
            const m = Math.floor(sec / 60);
            const s = Math.floor(sec % 60);
            return m + ':' + String(s).padStart(2, '0');
        }

        function onAudioTimeUpdate() {
            if (!audioEl || !audioEl.duration) return;
            const pct = Math.min((audioEl.currentTime / audioEl.duration) * 100, 100);
            const fill = document.getElementById('progressFill');
            if (fill) fill.style.width = pct + '%';
            const el = document.getElementById('playerElapsed');
            if (el) el.textContent = formatTime(audioEl.currentTime);
        }

        function onAudioLoadedMetadata() {
            if (!audioEl || !isFinite(audioEl.duration)) return;
            const dur = formatTime(audioEl.duration);
            const dEl = document.getElementById('playerDuration');
            if (dEl) dEl.textContent = dur;
            if (currentAlbumIdx >= 0 && currentTrackIdx >= 0) {
                const tr = albums[currentAlbumIdx] && albums[currentAlbumIdx].tracks[currentTrackIdx];
                if (tr) tr.duration = dur;
                const row = document.querySelector('#track' + currentAlbumIdx + '_' + currentTrackIdx + ' .track-duration');
                if (row) row.textContent = dur;
            }
        }

        function onAudioEnded() {
            if (isRepeating) {
                audioEl.currentTime = 0;
                audioEl.play().catch(()=>{});
            } else {
                nextTrack();
            }
        }

        // ============================================
        // MOBILE SIDEBAR FUNCTIONS
        // ============================================

        function toggleMobileSidebar() {
            const sidebar = document.querySelector('.library-sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            const hamburgerBtn = document.getElementById('hamburgerBtn');

            if (sidebar.classList.contains('active')) {
                closeMobileSidebar();
            } else {
                openMobileSidebar();
            }
        }

        function openMobileSidebar() {
            const sidebar = document.querySelector('.library-sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            const hamburgerBtn = document.getElementById('hamburgerBtn');

            sidebar.classList.add('active');
            overlay.classList.add('active');
            hamburgerBtn.classList.add('active');

            if (window.innerWidth <= 768) {
                document.body.style.overflow = 'hidden';
            }
        }

        function closeMobileSidebar() {
            const sidebar = document.querySelector('.library-sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            const hamburgerBtn = document.getElementById('hamburgerBtn');

            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            hamburgerBtn.classList.remove('active');

            if (window.innerWidth <= 768) {
                document.body.style.overflow = 'auto';
            }
        }

        // ============================================
        // MOBILE ACCORDION FUNCTIONS
        // ============================================

        function toggleAccordion(section) {
            const content = document.getElementById(`${section}Content`);
            const toggle = document.getElementById(`${section}Toggle`);
            const isExpanded = content.classList.contains('expanded');

            // Close all sections first
            document.querySelectorAll('.accordion-content.expanded').forEach(el => {
                el.classList.remove('expanded');
            });
            document.querySelectorAll('.accordion-toggle.expanded').forEach(el => {
                el.classList.remove('expanded');
            });

            // If the clicked section wasn't open, open it
            if (!isExpanded) {
                content.classList.add('expanded');
                toggle.classList.add('expanded');
            }
        }

        function renderMobileAlbumList() {
            const container = document.getElementById('mobileAlbumList');
            if (!container) return;

            const badge = document.getElementById('albumsBadge');
            if (badge) badge.textContent = albums.length;

            container.innerHTML = albums.map((album, idx) => `
                <div class="album-item ${idx === currentAlbumIdx ? 'active' : ''}" onclick="selectAlbum(${idx}); closeMobileSidebar();" id="mobileAlbumItem${idx}">
                    <img class="album-item-art" src="${album.image}" alt="${album.name}" loading="lazy">
                    <div class="album-item-info">
                        <div class="album-item-name">${album.name}</div>
                        <div class="album-item-artist">Album &bull; ${album.artist}</div>
                    </div>
                </div>
            `).join('');
        }

        function renderMobilePopularList() {
            const container = document.getElementById('mobilePopularList');
            if (!container) return;

            const popular = [5, 6, 4, 1].filter(i => i < albums.length);

            container.innerHTML = `
                ${popular.map(idx => `
                    <div class="album-item" onclick="selectAlbum(${idx}); closeMobileSidebar();">
                        <img class="album-item-art" src="${albums[idx].image}" alt="${albums[idx].name}" loading="lazy">
                        <div class="album-item-info">
                            <div class="album-item-name">${albums[idx].name}</div>
                            <div class="album-item-artist">${albums[idx].artist}</div>
                        </div>
                    </div>
                `).join('')}
            `;
        }

        // ============================================
        // INITIALIZATION
        // ============================================

        document.addEventListener('DOMContentLoaded', async () => {
            try {
                await loadAlbumsFromCDN();
            } catch (e) {
                console.error('CDN load failed', e);
                const main = document.getElementById('mainContent');
                if (main) {
                    main.innerHTML = '<div style="padding:60px 24px;text-align:center;color:var(--text-muted)">'
                        + '<div style="font-size:18px;margin-bottom:8px">Music catalog unavailable</div>'
                        + '<div style="font-size:13px">Could not reach the content repository. Please try again later.</div>'
                        + '</div>';
                }
                return;
            }
            if (!albums.length) {
                const main = document.getElementById('mainContent');
                if (main) main.innerHTML = '<div style="padding:60px 24px;text-align:center;color:var(--text-muted)">No albums available yet.</div>';
                return;
            }

            renderAlbumList();
            renderPopularSidebar();
            renderMobileAlbumList();
            renderMobilePopularList();
            loadUserFollowedAlbums();

            // Check for album query parameter (from homepage music cards)
            const params = new URLSearchParams(window.location.search);
            const albumParam = params.get('album');
            if (albumParam !== null) {
                const idx = parseInt(albumParam);
                if (idx >= 0 && idx < albums.length) {
                    selectAlbum(idx);
                    playTrack(idx, 0);
                } else {
                    selectAlbum(0);
                }
            } else {
                selectAlbum(0);
            }
        });

        // ============================================
        // RENDER FUNCTIONS
        // ============================================

        function renderAlbumList() {
            const list = document.getElementById('albumList');
            list.innerHTML = albums.map((album, idx) => `
                <div class="album-item ${idx === currentAlbumIdx ? 'active' : ''}" onclick="selectAlbum(${idx})" id="albumItem${idx}">
                    <img class="album-item-art" src="${album.image}" alt="${album.name}" loading="lazy">
                    <div class="album-item-info">
                        <div class="album-item-name">${album.name}</div>
                        <div class="album-item-artist">Album &bull; ${album.artist}</div>
                    </div>
                </div>
            `).join('');
        }

        function renderPopularSidebar() {
            const sidebar = document.getElementById('popularSidebar');
            const popular = [5, 6, 4, 1].filter(i => i < albums.length);
            const viral   = [7, 3, 0, 2].filter(i => i < albums.length);

            const followedIdxs = [...userFollowedAlbums]
                .map(slug => albumIdxBySlug(slug))
                .filter(i => i >= 0);

            const followedHTML = followedIdxs.length
                ? `
                    <div class="popular-title">Followed Albums</div>
                    ${followedIdxs.map(idx => renderPopularCard(idx)).join('')}
                    <div class="popular-divider"></div>
                `
                : '';

            const popularHTML = popular.length
                ? `<div class="${followedIdxs.length ? 'popular-section-title' : 'popular-title'}">Popular Albums</div>
                   ${popular.map(idx => renderPopularCard(idx)).join('')}`
                : '';
            const viralHTML = viral.length
                ? `<div class="popular-divider"></div>
                   <div class="popular-section-title">Viral Worship</div>
                   ${viral.map(idx => renderPopularCard(idx)).join('')}`
                : '';

            sidebar.innerHTML = `${followedHTML}${popularHTML}${viralHTML}`;
        }

        function renderPopularCard(idx) {
            const album = albums[idx];
            return `
                <div class="popular-card" onclick="selectAlbum(${idx})">
                    <img class="popular-card-art" src="${album.image}" alt="${album.name}" loading="lazy">
                    <div class="popular-card-info">
                        <div class="popular-card-name">${album.name}</div>
                        <div class="popular-card-artist">${album.artist}</div>
                        <div class="popular-card-listeners">${album.listeners}</div>
                    </div>
                </div>
            `;
        }

        function selectAlbum(idx) {
            currentAlbumIdx = idx;
            const album = albums[idx];

            // Update sidebar active state (desktop + mobile)
            document.querySelectorAll('.album-item').forEach(el => {
                el.classList.remove('active');
            });
            const desktopItem = document.getElementById(`albumItem${idx}`);
            const mobileItem = document.getElementById(`mobileAlbumItem${idx}`);
            if (desktopItem) desktopItem.classList.add('active');
            if (mobileItem) mobileItem.classList.add('active');

            // Calculate total duration. Tracks may have placeholder durations
            // ('--:--') until the audio element loads metadata for each one.
            let totalSeconds = 0;
            let durationsKnown = 0;
            album.tracks.forEach(t => {
                const parts = (t.duration || '').split(':');
                const m = parseInt(parts[0]);
                const s = parseInt(parts[1]);
                if (Number.isFinite(m) && Number.isFinite(s)) {
                    totalSeconds += m * 60 + s;
                    durationsKnown++;
                }
            });
            const totalLabel = durationsKnown === album.tracks.length
                ? `${Math.floor(totalSeconds / 60)} min ${totalSeconds % 60} sec`
                : (durationsKnown > 0
                    ? `${Math.floor(totalSeconds / 60)}+ min`
                    : '');

            // Render center content
            const main = document.getElementById('mainContent');
            main.innerHTML = `
                <div class="album-banner">
                    <img class="album-banner-art" src="${album.image}" alt="${album.name}">
                    <div class="album-banner-info">
                        <div class="album-banner-label">Album</div>
                        <h1 class="album-banner-title">${album.name}</h1>
                        <div class="album-banner-meta">
                            <span class="album-banner-artist">${album.artist}</span>
                            <span class="album-banner-dot"></span>
                            <span>${album.year}</span>
                            <span class="album-banner-dot"></span>
                            <span>${album.tracks.length} songs${totalLabel ? ', ' + totalLabel : ''}</span>
                        </div>
                        <div class="album-banner-listeners">${album.listeners}</div>
                    </div>
                </div>
                <div class="album-actions">
                    <button class="btn-play-large" id="bannerPlayBtn" onclick="toggleBannerPlay(${idx})" title="Play">
                        <svg id="bannerPlayIcon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </button>
                    <button class="btn-follow ${userFollowedAlbums.has(albumIdFor(idx)) ? 'following' : ''}" id="followBtn" onclick="toggleFollow(this)">${userFollowedAlbums.has(albumIdFor(idx)) ? 'Following' : 'Follow'}</button>
                </div>
                <div class="track-list">
                    <div class="track-header">
                        <span>#</span>
                        <span>Title</span>
                        <span style="text-align:right">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </span>
                    </div>
                    ${album.tracks.map((track, ti) => `
                        <div class="track-row ${currentAlbumIdx === idx && currentTrackIdx === ti ? 'playing' : ''}" onclick="playTrack(${idx}, ${ti})" id="track${idx}_${ti}">
                            <div class="track-num">
                                <span class="track-num-text">${ti + 1}</span>
                                <span class="track-num-play">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                </span>
                            </div>
                            <div class="track-info">
                                <div class="track-title">${track.title}<svg class="track-title-repeat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Repeat on"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></div>
                            </div>
                            <div class="track-duration">${track.duration}</div>
                        </div>
                    `).join('')}
                </div>
            `;
            main.scrollTop = 0;
        }

        // ============================================
        // PLAYBACK CONTROLS
        // ============================================

        function playTrack(albumIdx, trackIdx) {
            currentAlbumIdx = albumIdx;
            currentTrackIdx = trackIdx;
            isPlaying = true;

            const album = albums[albumIdx];
            const track = album.tracks[trackIdx];

            document.getElementById('playerArt').src = album.image;
            document.getElementById('playerTrackName').textContent = track.title;
            document.getElementById('playerArtist').textContent = album.artist;
            document.getElementById('playerDuration').textContent = track.duration || '--:--';

            updatePlayIcon();

            // Reset progress UI; real progress comes from the audio element's
            // timeupdate / loadedmetadata events (onAudioTimeUpdate, onAudioLoadedMetadata).
            document.getElementById('progressFill').style.width = '0%';
            document.getElementById('playerElapsed').textContent = '0:00';

            // Highlight active track
            document.querySelectorAll('.track-row').forEach(el => el.classList.remove('playing'));
            const activeRow = document.getElementById('track' + albumIdx + '_' + trackIdx);
            if (activeRow) activeRow.classList.add('playing');

            renderAlbumList();
            startAudioPlayback(albumIdx, trackIdx);
        }

        function togglePlay() {
            if (currentTrackIdx === -1) {
                if (currentAlbumIdx >= 0) playTrack(currentAlbumIdx, 0);
                return;
            }
            isPlaying = !isPlaying;
            if (isPlaying) {
                resumeAudioPlayback();
            } else {
                stopAudioPlayback();
            }
            updatePlayIcon();
        }

        function updatePlayIcon() {
            const playSvg = '<polygon points="5 3 19 12 5 21 5 3"/>';
            const pauseSvg = '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>';

            const icon = document.getElementById('playIcon');
            icon.innerHTML = isPlaying ? pauseSvg : playSvg;

            const bannerIcon = document.getElementById('bannerPlayIcon');
            if (bannerIcon) {
                bannerIcon.innerHTML = isPlaying ? pauseSvg : playSvg;
            }
        }

        function toggleBannerPlay(idx) {
            if (isPlaying && currentAlbumIdx === idx) {
                togglePlay();
            } else {
                playTrack(idx, 0);
            }
        }

        function prevTrack() {
            if (currentAlbumIdx < 0) return;
            const album = albums[currentAlbumIdx];
            let newIdx = currentTrackIdx - 1;
            if (newIdx < 0) newIdx = album.tracks.length - 1;
            playTrack(currentAlbumIdx, newIdx);
        }

        function nextTrack() {
            if (currentAlbumIdx < 0) return;
            const album = albums[currentAlbumIdx];
            let newIdx;
            if (isShuffled) {
                newIdx = Math.floor(Math.random() * album.tracks.length);
            } else {
                newIdx = currentTrackIdx + 1;
                if (newIdx >= album.tracks.length) {
                    if (isRepeating) { newIdx = 0; }
                    else { stopAudioPlayback(); isPlaying = false; updatePlayIcon(); return; }
                }
            }
            playTrack(currentAlbumIdx, newIdx);
        }

        function toggleShuffle() {
            isShuffled = !isShuffled;
            document.getElementById('shuffleBtn').classList.toggle('active', isShuffled);
        }

        function toggleRepeat() {
            isRepeating = !isRepeating;
            document.getElementById('repeatBtn').classList.toggle('active', isRepeating);
            document.body.classList.toggle('repeat-on', isRepeating);
        }

        function seekTrack(e) {
            if (currentTrackIdx < 0 || !audioEl || !isFinite(audioEl.duration)) return;
            const bar = document.getElementById('progressBar');
            const rect = bar.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            audioEl.currentTime = pct * audioEl.duration;
            document.getElementById('progressFill').style.width = (pct * 100) + '%';
            document.getElementById('playerElapsed').textContent = formatTime(audioEl.currentTime);
        }


        async function toggleFollow(btn) {
            const authData = getAuthData();
            if (!authData) {
                requireLogin('follow albums');
                return;
            }
            if (currentAlbumIdx < 0) return;

            const album = albums[currentAlbumIdx];
            const albumId = albumIdFor(currentAlbumIdx);
            const wasFollowed = userFollowedAlbums.has(albumId);

            // Optimistic UI
            if (wasFollowed) {
                userFollowedAlbums.delete(albumId);
                btn.classList.remove('following');
                btn.textContent = 'Follow';
            } else {
                userFollowedAlbums.add(albumId);
                btn.classList.add('following');
                btn.textContent = 'Following';
            }

            try {
                let res;
                if (wasFollowed) {
                    res = await fetch(`/api/music/follows/${encodeURIComponent(albumId)}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders()
                    });
                } else {
                    res = await fetch('/api/music/follows', {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({
                            album_id: albumId,
                            album_name: album.name,
                            album_artist: album.artist,
                            album_image: album.image
                        })
                    });
                }
                if (!res.ok) throw new Error('Server rejected follow change');
                renderPopularSidebar();
            } catch (err) {
                console.error('[Album Follows] toggle error:', err);
                // Revert
                if (wasFollowed) {
                    userFollowedAlbums.add(albumId);
                    btn.classList.add('following');
                    btn.textContent = 'Following';
                } else {
                    userFollowedAlbums.delete(albumId);
                    btn.classList.remove('following');
                    btn.textContent = 'Follow';
                }
                alert('Failed to update follows. Please try again.');
            }
        }

        function toggleLike() {
            const btn = document.querySelector('.player-track-like');
            const svg = btn.querySelector('svg');
            const isLiked = svg.getAttribute('fill') !== 'none';
            svg.setAttribute('fill', isLiked ? 'none' : 'var(--accent-gold)');
            svg.setAttribute('stroke', isLiked ? 'currentColor' : 'var(--accent-gold)');
            btn.style.color = isLiked ? '' : 'var(--accent-gold)';
        }

        // Volume controls
        function handleVolumeClick(e) {
            const bar = document.getElementById('volumeBar');
            const rect = bar.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setAudioVolume(pct);
            document.querySelector('.volume-fill').style.width = (pct * 100) + '%';
        }

        let preMuteVolume = 0.7;
        function toggleMute() {
            if (audioVolume > 0) {
                preMuteVolume = audioVolume;
                setAudioVolume(0);
                document.querySelector('.volume-fill').style.width = '0%';
            } else {
                setAudioVolume(preMuteVolume);
                document.querySelector('.volume-fill').style.width = (preMuteVolume * 100) + '%';
            }
        }
