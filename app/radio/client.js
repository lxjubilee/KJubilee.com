'use client';

import { usePageScripts } from '@/lib/use-page-script';

/*
 * Ported from public/radio.
 *
 * The markup is that file's markup; its <style> block is now
 * public/css/pages/radio.css and its inline
 * <script> is now /js/pages/radio.js.
 * Nothing about the behaviour changed — the scripts are the same classic
 * scripts, loaded in the same order, and usePageScripts unwinds what they
 * register when this page goes away.
 */
export default function RadioPage() {
    usePageScripts(['/js/pages/radio.js', '/js/site-translate.js']);

    return (
        <>
            <link rel="stylesheet" href="/css/pages/radio.css" precedence="kj-page" />
            {/* Header */}
                <header className="header">
                    <div className="header-inner">
                        <a href="/" className="logo">
                            <img src="/images/members/JubileeNova-Circle-200.png" alt="Nova" className="logo-icon" />
                            <div className="logo-text">Jubilee<span className="logo-verse">Verse</span><span className="logo-dotcom">.com</span></div>
                        </a>
                        {/* Radio Stations brand mark — moved out of the sidebar so the
                             page title reads at the top, next to the kJubilee logo. */}
                        <div className="header-page-title" aria-label="Radio Stations">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49" /><path d="M7.76 16.24a6 6 0 0 1 0-8.49" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M4.93 19.07a10 10 0 0 1 0-14.14" /></svg>
                            <span>Radio Stations</span>
                        </div>
                        <a href="/" className="back-link">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                            Back to Home
                        </a>
                    </div>
                </header>

                {/* Hamburger Menu Button (Mobile Only) */}
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
                <div className="radio-layout">
                    {/* Left Sidebar - Stations */}
                    <aside className="station-sidebar" id="stationSidebar">
                        {/* "Radio Stations" header lives in the top kJubilee
                             header now; the sidebar opens straight into the tabs. */}
                        {/* Drag-to-resize handle on the right edge. Width persists
                             to localStorage; clamp 280 px – 30 vw. */}
                        <div className="sidebar-resize-handle" id="sidebarResizeHandle" role="separator" aria-orientation="vertical" aria-label="Resize stations sidebar" onPointerDown={(event) => { startSidebarResize(event) }}></div>
                        {/* Vertical tabs strip + (dimensions panel | card grid) panel. */}
                        <div className="station-sidebar-body">
                            <div className="station-tab-strip" role="tablist" aria-label="Station list filter">
                                <button className="station-tab active" id="tabAllStations" role="tab" aria-selected="true" onClick={(event) => { setSidebarTab('all') }}>All Stations</button>
                                <button className="station-tab" id="tabDimensions" role="tab" aria-selected="false" onClick={(event) => { setSidebarTab('dimensions') }}>Dimensions</button>
                                <button className="station-tab" id="tabFavorites" role="tab" aria-selected="false" onClick={(event) => { setSidebarTab('favorites') }}>Favorites</button>
                                <button className="station-tab" id="tabCountries" role="tab" aria-selected="false" onClick={(event) => { setSidebarTab('countries') }}>Countries</button>
                            </div>
                            {/* Right column hosts two stacked panels — only one shown at a time:
                                 • #stationListPanel for the All Stations / Favorites tabs
                                 • #dimensionsPanel for the Dimensions tab (filter controls) */}
                            <div className="station-sidebar-cards">
                                {/* Cards panel (visible for All Stations + Favorites). */}
                                <div className="station-sidebar-panel" id="stationListPanel">
                                    <div className="station-card-grid" id="stationList" role="tabpanel"></div>
                                </div>

                                {/* Dimensions panel (visible for Dimensions tab). */}
                                <div className="station-sidebar-panel" id="dimensionsPanel" hidden={true}>
                                    <div className="dimensions-section">
                                        <h3 className="dimensions-section-title">Personalize your dial</h3>
                                        <p className="dimensions-section-help">Tap dimensions to add their stations to your dial. Defaults are Music · Prayer · Devotionals.</p>
                                        <div className="dimension-toggle-strip dimension-toggle-strip--panel" id="dimensionStrip" role="toolbar" aria-label="Activate dimensions to personalize your station list">
                                            {/* Buttons injected by renderDimensionStrip() */}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Mobile Accordion Structure */}
                        <div className="mobile-accordion">
                            {/* Radio Stations Section */}
                            <div className="accordion-section">
                                <div className="accordion-header" onClick={(event) => { toggleAccordion('stations') }}>
                                    <div className="accordion-title">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49" /><path d="M7.76 16.24a6 6 0 0 1 0-8.49" /></svg>
                                        Radio Stations
                                    </div>
                                    <span className="accordion-badge" id="stationsBadge">0</span>
                                    <svg className="accordion-toggle expanded" id="stationsToggle" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                </div>
                                <div className="accordion-content expanded" id="stationsContent">
                                    {/* Mobile mirrors the desktop tab strip — All Stations / Dimensions / Favorites / Countries.
                                         Same setSidebarTab() target so desktop + mobile share state. */}
                                    <div className="accordion-filters mobile-tab-row" role="tablist" aria-label="Station list view">
                                        <button className="filter-chip active" id="mobileTabAllStations" role="tab" aria-selected="true" onClick={(event) => { setSidebarTab('all') }}>All Stations</button>
                                        <button className="filter-chip" id="mobileTabDimensions" role="tab" aria-selected="false" onClick={(event) => { setSidebarTab('dimensions') }}>Dimensions</button>
                                        <button className="filter-chip" id="mobileTabFavorites" role="tab" aria-selected="false" onClick={(event) => { setSidebarTab('favorites') }}>Favorites</button>
                                        <button className="filter-chip" id="mobileTabCountries" role="tab" aria-selected="false" onClick={(event) => { setSidebarTab('countries') }}>Countries</button>
                                    </div>
                                    {/* Three swappable panels: setSidebarTab() toggles `hidden` so
                                         only the active tab's panel paints in the sidebar. */}
                                    <div className="accordion-list mobile-tab-panel" id="mobileStationList" data-tab-panel="all"></div>
                                    <div className="accordion-list mobile-tab-panel" id="mobileFavoritesList" data-tab-panel="favorites" hidden={true}></div>
                                    <div className="mobile-tab-panel mobile-dimensions-panel" id="mobileDimensionsPanel" data-tab-panel="dimensions" hidden={true}>
                                        <div className="dimensions-section">
                                            <h3 className="dimensions-section-title">Personalize your dial</h3>
                                            <p className="dimensions-section-help">Tap dimensions to add their stations to your dial. Defaults are Music · Prayer · Devotionals.</p>
                                            <div className="dimension-toggle-strip dimension-toggle-strip--panel" id="mobileDimensionStrip" role="toolbar" aria-label="Activate dimensions to personalize your station list">
                                                {/* Buttons injected by renderDimensionStrip() */}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Discover sidebar lives here on mobile (Playing List / Schedule).
                                 renderDiscoverSidebar() paints both #discoverSidebar (desktop right
                                 column) and #discoverSidebarMobile (this mount). */}
                            <div className="mobile-discover-mount" id="discoverSidebarMobile"></div>
                        </div>
                    </aside>

                    {/* Center - Station Content */}
                    <main className="main-content" id="mainContent">
                        <div className="empty-state">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49" /><path d="M7.76 16.24a6 6 0 0 1 0-8.49" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M4.93 19.07a10 10 0 0 1 0-14.14" /></svg>
                            <h3>Select a station</h3>
                            <p>Choose a radio station from the list to start listening</p>
                        </div>
                    </main>

                    {/* Right Sidebar - Discover */}
                    <aside className="discover-sidebar" id="discoverSidebar"></aside>
                </div>

                {/* Sticky Footer Player */}
                <div className="radio-player" id="radioPlayer">
                    {/* Pin to all pages — toggles cross-page persistence. When active,
                         the listener's selected station + playing state are saved to
                         localStorage so the sticky-radio-player.js script on other
                         pages can re-render the footer + resume playback. */}
                    <button type="button" className="radio-player-pin-btn" id="radioPlayerPinBtn" onClick={(event) => { toggleRadioPlayerPin() }} title="Pin player to all pages (currently unpinned)" aria-label="Pin player to all pages" aria-pressed="false">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 17v5" />
                            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
                        </svg>
                    </button>

                    {/* Single controls row: station-info | Heaven's Band tuner | controls | volume.
                         Equalizer column dropped — the dial now owns the visual+functional
                         role the eq used to play. */}
                    <div className="radio-player-controls-row">
                    {/* Left - Station Info */}
                    <div className="player-station-info">
                        <img className="player-station-art" id="playerArt" src="https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=120&h=120&fit=crop" alt="" />
                        <div className="player-station-text">
                            <div className="player-station-meta-row">
                                <div className="player-station-name" id="playerStationName">No station selected</div>
                                <span className="player-station-hm" id="playerStationHm" hidden={true}></span>
                                <span className="player-mode-badge" id="playerModeBadge" hidden={true}></span>
                                <span className="player-cycle-badge" id="playerCycleBadge" hidden={true}></span>
                            </div>
                            <div className="player-station-show" id="playerShowName">-</div>
                            <div className="player-station-host" id="playerStationHost"></div>
                        </div>
                        <div className="player-station-actions">
                            <button className="player-like-btn" onClick={(event) => { toggleLike() }} title="Like" aria-label="Like">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                            </button>
                            <button className="player-feedback-btn" id="thumbUpBtn" onClick={(event) => { rateSegment('up') }} title="Thumbs up" aria-label="Thumbs up" disabled={true}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></svg>
                            </button>
                            <button className="player-feedback-btn" id="thumbDownBtn" onClick={(event) => { rateSegment('down') }} title="Thumbs down" aria-label="Thumbs down" disabled={true}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></svg>
                            </button>
                            <button className="player-feedback-btn" id="commentBtn" onClick={(event) => { openCommentModal() }} title="Leave a comment" aria-label="Leave a comment" disabled={true}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                            </button>
                            <button className="player-feedback-btn" id="voicemailBtn" onClick={(event) => { openVoicemailModal() }} title="Record a voice message" aria-label="Record a voice message" disabled={true}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /></svg>
                            </button>
                            <button className="player-share-btn" onClick={(event) => { shareStation() }} title="Share station" aria-label="Share station">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
                            </button>
                            <button className="player-prayer-btn is-hidden" id="playerPrayerBtn" onClick={(event) => { openPrayerModal() }} title="Submit a Prayer" aria-label="Submit a Prayer">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                            </button>
                        </div>
                    </div>

                    {/* Heaven's Dial v1.0 — tri-band SVG tuner. Sits inline right
                         of the Station Identifier in the player footer. Three
                         vertically-stacked bands (Five-Fold ministry / Multilingual /
                         Mainstream) with station bars colored + sized by spec. The
                         orange indicator overlays the active station's bar. */}
                    <div className="heaven-dial-tuner heaven-dial-tuner--inline heaven-dial-tuner--triband" id="heavenDialTuner" aria-hidden="true">
                        <div className="dial-tune-row">
                            <div className="dial-svg-wrap">
                                <svg className="dial-svg" viewBox="0 0 700 57" preserveAspectRatio="none" id="dialSvg" role="img" aria-label="Heaven's Dial tri-band tuner">
                                    {/* ViewBox tightened so bars span almost the
                                         full SVG height — only 2u top/bottom for
                                         the indicator arrowheads. */}
                                    <g id="dialStations"></g>
                                    <g id="dialIndicator" style={{display: "none"}}>
                                        <rect id="dialIndicatorBar" x="0" y="2" width="4" height="53" fill="#f5a524" opacity="0.9" />
                                        <polygon id="dialIndicatorTop" fill="#f5a524" opacity="0.9" points="0,0 0,0 0,4" />
                                        <polygon id="dialIndicatorBot" fill="#f5a524" opacity="0.9" points="0,57 0,57 0,53" />
                                    </g>
                                </svg>
                                {/* Frequency scale lives outside the SVG so labels
                                     stay un-stretched while the dial fills 100% of
                                     the available width. Positions match the SVG's
                                     x=28..680 active range as percentages of the
                                     700-unit viewBox. */}
                                <div className="dial-scale-row" id="dialScale" aria-hidden="true">
                                    <span style={{left: "4.0%"}}>HM 300</span>
                                    <span style={{left: "22.86%"}}>320</span>
                                    <span style={{left: "41.43%"}}>340</span>
                                    <span style={{left: "60.0%"}}>360</span>
                                    <span style={{left: "78.57%"}}>380</span>
                                    <span style={{left: "97.14%"}}>HM 400</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Center - Controls */}
                    <div className="player-controls">
                        <div className="player-live-indicator inactive" id="liveIndicator">
                            <span className="player-live-dot"></span>
                            LIVE
                        </div>
                        <div className="player-buttons">
                            {/* Previous: step one station down the HM-ordered filtered
                                 list. Reuses tuneDown() so the dial indicator + audio
                                 state side-effects stay wired. */}
                            <button type="button" className="player-btn-skip" id="playerBtnPrev" onClick={(event) => { tuneDown() }} title="Previous station" aria-label="Previous station" disabled={true}>
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <polygon points="15 6 9 12 15 18" />
                                    <rect x="6" y="6" width="2" height="12" />
                                </svg>
                            </button>
                            <button className="player-btn-play" id="playBtn" type="button" onClick={(event) => { togglePlay() }} title="Play" aria-label="Play / pause">
                                {/* Decorative hex background (two concentric halos + filled face). */}
                                <svg className="hex-bg" viewBox="0 0 80 70" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                                    <polygon className="hex-ring-outer" points="40,2 76,21 76,49 40,68 4,49 4,21" />
                                    <polygon className="hex-ring-inner" points="40,8 71,24 71,46 40,62 9,46 9,24" />
                                    <polygon className="hex-fill" points="40,14 66,28 66,42 40,56 14,42 14,28" />
                                </svg>
                                {/* Foreground play / pause glyph — updatePlayIcon() rewrites this innerHTML. */}
                                <svg id="playIcon" className="hex-play-icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                            </button>
                            {/* Next: step one station up the HM-ordered filtered list. */}
                            <button type="button" className="player-btn-skip" id="playerBtnNext" onClick={(event) => { tuneUp() }} title="Next station" aria-label="Next station" disabled={true}>
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <polygon points="9 6 15 12 9 18" />
                                    <rect x="16" y="6" width="2" height="12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Volume */}
                    <div className="player-volume">
                        <div className="player-volume-row">
                            <button className="volume-btn" id="volumeBtn" title="Volume" onClick={(event) => { toggleMute() }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                            </button>
                            <div className="volume-bar" id="volumeBar" onPointerDown={(event) => { startVolumeDrag(event) }}>
                                <div className="volume-fill">
                                    <div className="volume-knob"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    </div>{/* /radio-player-controls-row */}
                </div>

    

                {/* Sign-in prompt modal — shown when an anonymous user tries to favorite or follow. */}
                <div className="auth-prompt-overlay" id="authPromptOverlay" role="dialog" aria-modal="true" aria-labelledby="authPromptTitle" onClick={(event) => { if (event.target === event.currentTarget) closeAuthPrompt() }}>
                    <div className="auth-prompt-card">
                        <div className="auth-prompt-icon" aria-hidden="true">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                            </svg>
                        </div>
                        <h3 className="auth-prompt-title" id="authPromptTitle">Sign in to <span id="authPromptAction">save favorites</span></h3>
                        <p className="auth-prompt-body">Create a free kJubilee account or sign in to keep your favorite stations and follows synced across every device you use.</p>
                        <div className="auth-prompt-actions">
                            <a className="auth-prompt-btn primary" id="authPromptSignIn" href="/login">Sign In</a>
                            <a className="auth-prompt-btn" id="authPromptSignUp" href="/signup">Create Account</a>
                        </div>
                        <button className="auth-prompt-cancel" type="button" onClick={(event) => { closeAuthPrompt() }}>Not now</button>
                    </div>
                </div>

                {/* Submit Prayer modal (Phase E, spec Part 1 + Part 8). Routes any
                     faith-mode listener into The Upper Room (HM 309.00) submission
                     pipeline. Mirrors .auth-prompt-overlay structure. */}
                <div className="prayer-modal-overlay" id="prayerModalOverlay" role="dialog" aria-modal="true" aria-labelledby="prayerModalTitle" onClick={(event) => { if (event.target === event.currentTarget) closePrayerModal() }}>
                    <div className="prayer-modal-card">
                        <h3 className="prayer-modal-title" id="prayerModalTitle">Submit a Prayer</h3>
                        <p className="prayer-modal-subtitle">The Upper Room · HM 309.00</p>

                        <div id="prayerFormView">
                            <div className="prayer-field">
                                <label htmlFor="prayerText">
                                    Your prayer
                                    <span className="prayer-counter" id="prayerCounter">0 / 500</span>
                                </label>
                                <textarea id="prayerText" maxLength="500" placeholder="Share what's on your heart…" onInput={(event) => { updatePrayerCounter() }}></textarea>
                                <span className="prayer-field-hint" id="prayerTextHint">
                                    Between 10 and 500 characters.
                                </span>
                            </div>

                            <div className="prayer-field">
                                <label htmlFor="prayerOnBehalf">On behalf of (optional)</label>
                                <input type="text" id="prayerOnBehalf" maxLength="80" placeholder="e.g., my mother, our church" />
                                <span className="prayer-field-hint">
                                    Don't name third parties without their consent. (Spec §8)
                                </span>
                            </div>

                            <div className="prayer-field">
                                <label className="prayer-toggle">
                                    <input type="checkbox" id="prayerAnonymous" checked={true} />
                                    Submit anonymously
                                </label>
                            </div>

                            <div className="prayer-actions">
                                <button type="button" className="auth-prompt-btn" onClick={(event) => { closePrayerModal() }}>Cancel</button>
                                <button type="button" className="auth-prompt-btn primary" id="prayerSubmitBtn" onClick={(event) => { submitPrayer() }}>Submit</button>
                            </div>
                        </div>

                        <div id="prayerCrisisView" className="prayer-crisis-panel" hidden={true}>
                            <h4>We're here for you.</h4>
                            <p>What you wrote tells us you may be hurting right now. Please reach
                            out to someone trained to help — you are not alone, and your life matters.</p>
                            <div className="prayer-crisis-resources">
                                <a href="tel:988" target="_blank" rel="noopener">
                                    <strong>988 — Suicide &amp; Crisis Lifeline (US)</strong>
                                    Call or text 988, 24/7
                                </a>
                                <a href="https://www.samaritans.org" target="_blank" rel="noopener">
                                    <strong>Samaritans (International)</strong>
                                    samaritans.org · Call 116 123 (UK/IE)
                                </a>
                                <a href="https://findahelpline.com" target="_blank" rel="noopener">
                                    <strong>Find a Helpline (Worldwide)</strong>
                                    findahelpline.com — local crisis numbers in 130+ countries
                                </a>
                            </div>
                            <div className="prayer-actions" style={{justifyContent: "center"}}>
                                <button type="button" className="auth-prompt-btn" onClick={(event) => { closePrayerModal() }}>Close</button>
                            </div>
                        </div>

                        <div className="prayer-modal-footer">
                            Your submission is treated as sacred and confidential. Identifiable
                            medical or personal info is auto-flagged for privacy review before
                            anything is shared.
                        </div>
                    </div>
                </div>

                {/* BR-I1 listener comment modal — reuses the prayer-modal styling.
                     Comments are tied to the currently-playing station/segment and
                     POST to /api/radio/feedback. */}
                <div className="prayer-modal-overlay" id="commentModalOverlay" role="dialog" aria-modal="true" aria-labelledby="commentModalTitle" onClick={(event) => { if (event.target === event.currentTarget) closeCommentModal() }}>
                    <div className="prayer-modal-card">
                        <h3 className="prayer-modal-title" id="commentModalTitle">Leave a Comment</h3>
                        <p className="prayer-modal-subtitle" id="commentModalSubtitle">-</p>

                        <div id="commentFormView">
                            <div className="prayer-field">
                                <label htmlFor="commentText">
                                    Your comment
                                    <span className="prayer-counter" id="commentCounter">0 / 400</span>
                                </label>
                                <textarea id="commentText" maxLength="400" placeholder="Tell us what you think of this station…" onInput={(event) => { updateCommentCounter() }}></textarea>
                                <span className="prayer-field-hint" id="commentTextHint">
                                    Between 3 and 400 characters.
                                </span>
                            </div>

                            <div className="prayer-actions">
                                <button type="button" className="auth-prompt-btn" onClick={(event) => { closeCommentModal() }}>Cancel</button>
                                <button type="button" className="auth-prompt-btn primary" id="commentSubmitBtn" onClick={(event) => { submitRadioComment() }}>Submit</button>
                            </div>
                        </div>

                        <div id="commentThanksView" className="prayer-crisis-panel" hidden={true}>
                            <h4>Thank you.</h4>
                            <p>Your comment was received. Approved comments may be shared on the air.</p>
                            <div className="prayer-actions" style={{justifyContent: "center"}}>
                                <button type="button" className="auth-prompt-btn" onClick={(event) => { closeCommentModal() }}>Close</button>
                            </div>
                        </div>

                        <div className="prayer-modal-footer">
                            Comments are reviewed before anything is read on the air.
                        </div>
                    </div>
                </div>

                {/* BR-I2 listener voice message modal — records in the browser via
                     MediaRecorder and uploads to /api/radio/voicemail. Submissions are
                     stored as "pending"; transcription + human review happen before
                     anything is broadcast. */}
                <div className="prayer-modal-overlay" id="voicemailModalOverlay" role="dialog" aria-modal="true" aria-labelledby="voicemailModalTitle" onClick={(event) => { if (event.target === event.currentTarget) closeVoicemailModal() }}>
                    <div className="prayer-modal-card">
                        <h3 className="prayer-modal-title" id="voicemailModalTitle">Record a Voice Message</h3>
                        <p className="prayer-modal-subtitle" id="voicemailModalSubtitle">-</p>

                        <div id="voicemailFormView">
                            <div className="vm-recorder">
                                <button type="button" className="vm-record-btn" id="vmRecordBtn" onClick={(event) => { vmToggleRecording() }} aria-label="Start or stop recording">
                                    <span className="vm-record-dot"></span>
                                </button>
                                <div className="vm-timer" id="vmTimer">0:00</div>
                                <div className="vm-status" id="vmStatus">Tap the mic to start recording (max 60s).</div>
                            </div>
                            <audio id="vmPreview" className="vm-preview" controls={true} hidden={true}></audio>
                            <div className="prayer-actions">
                                <button type="button" className="auth-prompt-btn" onClick={(event) => { closeVoicemailModal() }}>Cancel</button>
                                <button type="button" className="auth-prompt-btn" id="vmRerecordBtn" onClick={(event) => { vmReset() }} hidden={true}>Re-record</button>
                                <button type="button" className="auth-prompt-btn primary" id="vmSubmitBtn" onClick={(event) => { vmSubmit() }} disabled={true}>Submit</button>
                            </div>
                        </div>

                        <div id="voicemailThanksView" className="prayer-crisis-panel" hidden={true}>
                            <h4>Thank you.</h4>
                            <p>Your voice message was received. It will be reviewed before
                            anything is played on the air.</p>
                            <div className="prayer-actions" style={{justifyContent: "center"}}>
                                <button type="button" className="auth-prompt-btn" onClick={(event) => { closeVoicemailModal() }}>Close</button>
                            </div>
                        </div>

                        <div className="prayer-modal-footer">
                            Voice messages are transcribed and reviewed by a person before
                            anything is broadcast. Please keep it under 60 seconds.
                        </div>
                    </div>
                </div>
        </>
    );
}
