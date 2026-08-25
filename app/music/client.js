'use client';

import { usePageScripts } from '@/lib/use-page-script';

/*
 * Ported from public/music.html.
 *
 * The markup is that file's markup; its <style> block is now
 * public/css/pages/music.css and its inline
 * <script> is now /js/pages/music.js.
 * Nothing about the behaviour changed — the scripts are the same classic
 * scripts, loaded in the same order, and usePageScripts unwinds what they
 * register when this page goes away.
 */
export default function MusicPage() {
    usePageScripts(['/js/pages/music.js', '/js/site-translate.js']);

    return (
        <>
            <link rel="stylesheet" href="/css/pages/music.css" precedence="kj-page" />
            {/* Header */}
                <header className="header">
                    <div className="header-inner">
                        <a href="/" className="logo">
                            <img src="/images/members/JubileeNova-Circle-200.png" alt="Nova" className="logo-icon" />
                            <div className="logo-text">Jubilee<span className="logo-verse">Verse</span><span className="logo-dotcom">.com</span></div>
                        </a>
                        <a href="/" className="back-link">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                            Back to Home
                        </a>
                    </div>
                </header>

                {/* Mobile Hamburger Menu Button */}
                <button className="hamburger-btn" id="hamburgerBtn" onClick={(event) => { toggleMobileSidebar() }}>
                    <div className="hamburger-icon">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </button>

                {/* Mobile Sidebar Overlay */}
                <div className="sidebar-overlay" id="sidebarOverlay" onClick={(event) => { closeMobileSidebar() }}></div>

                {/* Three-Column Layout */}
                <div className="music-layout">
                    {/* Left Sidebar - Library */}
                    <aside className="library-sidebar">
                        {/* Desktop Sidebar Structure */}
                        <div className="library-header">
                            <div className="library-title">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                                Your Library
                            </div>
                            <button className="library-add-btn" title="Create playlist">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            </button>
                        </div>
                        <div className="library-filters">
                            <button className="filter-chip active">Albums</button>
                            <button className="filter-chip">Playlists</button>
                        </div>
                        <div className="library-search">
                            <span className="library-search-label">Recents</span>
                            <span className="library-sort">
                                Recents
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                            </span>
                        </div>
                        <div className="album-list" id="albumList"></div>

                        {/* Mobile Accordion */}
                        <div className="mobile-accordion">
                            <div className="accordion-section">
                                <div className="accordion-header" onClick={(event) => { toggleAccordion('albums') }}>
                                    <div className="accordion-title">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                                        Albums
                                    </div>
                                    <span className="accordion-badge" id="albumsBadge">0</span>
                                    <svg className="accordion-toggle expanded" id="albumsToggle" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                </div>
                                <div className="accordion-content expanded" id="albumsContent">
                                    <div id="mobileAlbumList"></div>
                                </div>
                            </div>
                            <div className="accordion-section">
                                <div className="accordion-header" onClick={(event) => { toggleAccordion('popular') }}>
                                    <div className="accordion-title">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                                        Popular
                                    </div>
                                    <svg className="accordion-toggle" id="popularToggle" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                </div>
                                <div className="accordion-content" id="popularContent">
                                    <div id="mobilePopularList"></div>
                                </div>
                            </div>
                        </div>
                    </aside>

                    {/* Center - Album Content */}
                    <main className="main-content" id="mainContent">
                        <div className="empty-state">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" /></svg>
                            <h3>Select an album</h3>
                            <p>Choose an album from your library to start listening</p>
                        </div>
                    </main>

                    {/* Right Sidebar - Popular */}
                    <aside className="popular-sidebar" id="popularSidebar"></aside>
                </div>

                {/* Sticky Footer Player */}
                <div className="music-player" id="musicPlayer">
                    {/* Left - Track Info */}
                    <div className="player-track-info">
                        <img className="player-track-art" id="playerArt" src="https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=120&h=120&fit=crop" alt="" />
                        <div className="player-track-text">
                            <div className="player-track-name" id="playerTrackName">No track selected</div>
                            <div className="player-track-artist" id="playerArtist">-</div>
                        </div>
                        <button className="player-track-like" onClick={(event) => { toggleLike() }} title="Like">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                        </button>
                    </div>

                    {/* Center - Controls */}
                    <div className="player-controls">
                        <div className="player-buttons">
                            <button className="player-btn" id="shuffleBtn" onClick={(event) => { toggleShuffle() }} title="Shuffle">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>
                            </button>
                            <button className="player-btn" onClick={(event) => { prevTrack() }} title="Previous">
                                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
                            </button>
                            <button className="player-btn-play" id="playBtn" onClick={(event) => { togglePlay() }} title="Play">
                                <svg id="playIcon" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                            </button>
                            <button className="player-btn" onClick={(event) => { nextTrack() }} title="Next">
                                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
                            </button>
                            <button className="player-btn" id="repeatBtn" onClick={(event) => { toggleRepeat() }} title="Repeat">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                            </button>
                        </div>
                        <div className="player-progress">
                            <span className="player-time" id="playerElapsed">0:00</span>
                            <div className="progress-bar" id="progressBar" onClick={(event) => { seekTrack(event) }}>
                                <div className="progress-fill" id="progressFill" style={{width: "0%"}}>
                                    <div className="progress-knob"></div>
                                </div>
                            </div>
                            <span className="player-time" id="playerDuration">0:00</span>
                        </div>
                    </div>

                    {/* Right - Volume */}
                    <div className="player-volume">
                        <button className="volume-btn" id="volumeBtn" title="Volume" onClick={(event) => { toggleMute() }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                        </button>
                        <div className="volume-bar" id="volumeBar" onClick={(event) => { handleVolumeClick(event) }}>
                            <div className="volume-fill">
                                <div className="volume-knob"></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sign-in prompt modal — shown when an anonymous user tries to follow an album. */}
                <div className="auth-prompt-overlay" id="authPromptOverlay" role="dialog" aria-modal="true" aria-labelledby="authPromptTitle" onClick={(event) => { if (event.target === event.currentTarget) closeAuthPrompt() }}>
                    <div className="auth-prompt-card">
                        <div className="auth-prompt-icon" aria-hidden="true">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                            </svg>
                        </div>
                        <h3 className="auth-prompt-title" id="authPromptTitle">Sign in to <span id="authPromptAction">follow albums</span></h3>
                        <p className="auth-prompt-body">Create a free kJubilee account or sign in to keep your followed albums synced across every device you use.</p>
                        <div className="auth-prompt-actions">
                            <a className="auth-prompt-btn primary" id="authPromptSignIn" href="/login.html">Sign In</a>
                            <a className="auth-prompt-btn" id="authPromptSignUp" href="/signup.html">Create Account</a>
                        </div>
                        <button className="auth-prompt-cancel" type="button" onClick={(event) => { closeAuthPrompt() }}>Not now</button>
                    </div>
                </div>

        </>
    );
}
