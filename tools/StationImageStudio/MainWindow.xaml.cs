using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;
// For Mutate(). Every ImageSharp TYPE stays fully qualified below, because
// System.Windows brings its own ResizeMode and Size into scope and an unqualified
// one here would be ambiguous rather than wrong-and-obvious.
using SixLabors.ImageSharp.Processing;

namespace StationImageStudio;

// A WPF host around a real WebView2 (Edge/Chromium) browser. You log in to
// ChatGPT by hand in the embedded browser — a genuine browser, so Cloudflare's
// human-check passes normally — and the session cookies persist in the app's own
// data folder. The app then drives YOUR authenticated session with injected
// JavaScript to submit each station's image prompt, waits for the image, and
// writes it into public/images/stations.
//
// Ported from InspireManna.com/tools/ArticleImageStudio, which was itself ported
// from JubileeVerse by way of JubiLujah. The browser-automation half is
// unchanged and has now survived four data layers. The DATA half is new here and
// is the whole point of this build:
//
//   JubiLujah / JubileeVerse / InspireManna — folders of .md articles, each one
//                             carrying its own `image_prompt` in frontmatter
//   kJubilee (this)         — the 102 stations of the Heavenly Modulation dial,
//                             read from public/js/stations-data.js, with NO
//                             prompt on disk anywhere
//
// THERE IS NO PROMPT TO READ, SO THIS TOOL WRITES ONE. A station is not a
// document: it has a name, a frequency, a programming type, a language, a region
// and a host, and nothing that reads like a scene. StationPrompt composes the
// scene from those fields — see "the picture this studio makes" below — and the
// composition is deterministic, seeded off the station's own HM frequency, so
// the same station regenerates as the same picture rather than as a new lottery.
//
// THE PICTURE THIS STUDIO MAKES. One subject, every time: people listening to
// kJubilee. The audio equipment in the frame is WHITE — white over-ear
// headphones, a small white portable radio, a white bedside radio, white
// earbuds, a white speaker — and it is the one thing held constant across a
// hundred and two otherwise unrelated scenes, because it is what makes a shelf
// of station covers read as one station family rather than as a hundred stock
// photographs.
//
// EVERY STATION HAS A HOST, AND THE HOST IS IN THE PICTURE. The catalog already
// assigns one of the twelve Inspire Family voices to every station in its `host`
// field, derived by tools/build-home-data.js from a per-format rota. This studio
// takes that assignment as the default, shows it on every row, lets it be
// changed per station (remembered in station-hosts.json), attaches that
// persona's portrait to the ChatGPT turn as a likeness reference, and extends
// the prompt to place them in the scene listening along with everyone else. See
// HostClause for why the reference's own clothing and background are explicitly
// thrown away.
//
// Done-ness is FILE EXISTENCE, not a field. An article could be marked done in
// its own frontmatter; a station has nowhere to write that, and inventing a
// place would create a second answer to a question the disk already answers.
// <slug>.webp in the images folder is the record. Delete it and the station
// requeues.
//
// NOTE on the approval gate: nothing here is reviewed automatically. Look at the
// images before they go near the site.
//
// NOTE: this automates the ChatGPT web UI, which may conflict with OpenAI's
// Terms of Use. It runs against your own logged-in session at your direction.
public partial class MainWindow : Window
{
    // ---- the dial ----------------------------------------------------------

    /// <summary>
    /// One station off public/js/stations-data.js. Only the fields this tool
    /// acts on: the catalog carries ratings, schedules and shelf placement too,
    /// all of which belong to the website and none of which changes a picture.
    /// </summary>
    private sealed class Station
    {
        public string Slug = "";
        public string Name = "";
        public string Hm = "";           // "088.70" — also the deterministic seed
        public string Freq = "";         // "HM 088.70"
        public string Primary = "";      // programming type; this is the tab it lands in
        public string Format = "";       // "Praise & Worship", or the language for an intl station
        public string Band = "";         // fivefold | multi | mainstream
        public string Lang = "English";
        public string Region = "domestic";
        public string Description = "";
        public string ShowName = "";
        public string CatalogHost = "";  // the persona the catalog assigns
        public int Order;

        /// The host actually used, override first. Set by ScanAll.
        public string Host = "";
        /// <summary>
        /// This station's position among the stations that share its scene pool —
        /// its region abroad, its programming type at home. Set by ScanAll.
        ///
        /// It exists so no two stations drawing from one pool can land on the
        /// same scene. See Scene(): hashing the slug is right for the light and
        /// the camera and wrong for the place, because a hash collides and the
        /// place is the thing the eye reads first.
        /// </summary>
        public int SceneIndex;
        /// The rendered file on disk, or "" when the station is still pending.
        public string ImageFile = "";
        public bool HasImage => ImageFile.Length > 0;
    }

    /// <summary>Every station, in catalog order.</summary>
    private readonly List<Station> _stations = new();

    /// <summary>Stations per programming-type slug, which is what the tabs are.</summary>
    private readonly Dictionary<string, List<Station>> _byGroup = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>The groups the tabs are built from, in display order.</summary>
    private List<(string Slug, string Display, string Header)> Groups = new();

    /// <summary>
    /// Display names and one-word tab headers for the programming types the
    /// catalog uses. A type NOT in here still gets a tab — see GroupLabel — so a
    /// new format added to the dial appears rather than disappearing, which is
    /// the failure the InspireManna build hit when its seven categories were
    /// hardcoded and a tenant arrived with different ones.
    /// </summary>
    private static readonly (string Slug, string Display, string Header)[] KnownGroups =
    {
        ("music",         "Music",                "Music"),
        ("devotionals",   "Devotionals",          "Devos"),
        ("bible_studies", "Bible Studies",        "Bible"),
        ("online_church", "Online Church",        "Church"),
        ("prayer",        "Prayer & Sanctuary",   "Prayer"),
        ("children",      "Kids & Family",        "Kids"),
        ("sleep_rest",    "Sleep & Rest",         "Sleep"),
        ("talk_podcasts", "Talk & Podcasts",      "Talk"),
        ("hebrew_roots",  "Hebrew Roots",         "Hebrew"),
        ("radio_theater", "Radio Theater",        "Theater"),
        ("multilanguage", "International",        "World"),
        ("mainstream",    "AI Format Stations",   "AI"),
    };

    /// <summary>Worklist per group slug, built with the tabs.</summary>
    private readonly Dictionary<string, ListBox> _listBySlug = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// The flattened scope. Not a programming type and never a key in the
    /// catalog, which is why it carries a name no slug could collide with.
    /// </summary>
    private const string AllSlug = "__all";

    // ---- where everything lives --------------------------------------------

    private const string DefaultSiteRoot = @"W:\kJubilee.com";
    private const string CatalogRelative = @"public\js\stations-data.js";
    private const string ImagesRelative = @"public\images\stations";
    private const string PersonasRelative = "personas";
    /// <summary>
    /// The JubiLujah music tree, whose album covers are the style reference.
    ///
    /// A different drive and a different site: kJubilee plays the music,
    /// jubilujah.com produced it and owns the artwork. Nothing is copied in —
    /// eight hundred covers would duplicate a tree that already exists and is
    /// already backed up, and all this tool needs of them is a 768px JPEG at
    /// generation time.
    /// </summary>
    private const string DefaultArtworkRoot = @"J:\jubilujah.com\music\inspire";

    private string _root = "";          // the repo, when it could be located
    private string _toolDir = "";
    private string _configFile = "";
    private string _hostsFile = "";
    private string _userDataFolder = "";
    private string _siteRoot = DefaultSiteRoot;
    private string _imagesRoot = "";
    private string _personasRoot = "";
    private string _artworkRoot = DefaultArtworkRoot;

    // ---- publishing to the CDN ---------------------------------------------
    //
    // A render that only exists on W: is not published, and the site cannot
    // serve it. The production box keeps its CDN tree at
    // /var/www/kjubilee.com/cdn-local, which the node app serves under /cdn/*,
    // so <slug>.webp copied into cdn-local/stations is immediately live at
    // https://www.kjubilee.com/cdn/stations/<slug>.webp.
    //
    // scp/ssh are shelled out to rather than pulling in an SSH library: the key
    // is already on this machine and already trusted by the host, and Windows
    // ships OpenSSH, so there is nothing to install and no second copy of the
    // credentials to keep in step.
    private const string DefaultPublishHost = "root@94.72.120.231";
    private const string DefaultPublishKey = @"%USERPROFILE%\.ssh\id_ed25519_jubilee_prod";
    private const string DefaultPublishDir = "/var/www/kjubilee.com/cdn-local/stations";
    private const string DefaultPublicBase = "https://www.kjubilee.com/cdn/stations";

    private bool _publishEnabled = true;
    private string _publishHost = DefaultPublishHost;
    private string _publishKey = DefaultPublishKey;
    private string _publishDir = DefaultPublishDir;
    private string _publicBase = DefaultPublicBase;
    private bool _remoteDirReady;   // mkdir -p is worth doing once, not per image

    /// The window placement read from studio.config.json, applied once the HWND
    /// exists. See WindowPlacement.cs for why this is not four doubles.
    private JsonObject? _savedWindow;

    // Layout the user dragged to, in device-independent pixels. Restored on
    // launch and written back on close, so the window comes up the way it was
    // left rather than resetting to the designer's guess every time.
    //
    // Kept as plain doubles rather than read off the ColumnDefinition at save
    // time only: a window closed while minimised reports an ActualWidth of 0 for
    // everything, and persisting that would open the next session with the panel
    // and the log collapsed to nothing.
    private double _panelWidth = DefaultPanelWidth;
    private double _logHeight = DefaultLogHeight;

    private const double DefaultPanelWidth = 344;
    private const double DefaultLogHeight = 170;
    private const double MinPanelWidth = 260;
    private const double MinLogHeight = 52;

    /// <summary>
    /// Per-station host overrides, slug to persona slug, read from and written to
    /// station-hosts.json beside the tool.
    ///
    /// A SEPARATE FILE, deliberately. The catalog's `host` field is generated by
    /// tools/build-home-data.js from a rota and is rewritten wholesale every time
    /// that tool runs; an override written back into stations-data.js would
    /// survive exactly until the next build of the home page. This file is the
    /// studio's own, so a deliberate reassignment outlives a regeneration of the
    /// catalog it overrides.
    /// </summary>
    private readonly Dictionary<string, string> _hostOverrides = new(StringComparer.OrdinalIgnoreCase);

    // Base64 JPEG of each host portrait, keyed by the file path it came from. A
    // sweep of 102 stations sends the same twelve pictures eight or nine times
    // each; decoding and re-encoding them once is the difference between a cache
    // hit and a hundred disk reads plus a hundred resizes.
    private readonly Dictionary<string, string> _referenceCache = new(StringComparer.OrdinalIgnoreCase);

    private bool _ready;
    private bool _running;
    private bool _homeRetried;
    private bool _syncingHost;
    private CancellationTokenSource? _cts;
    private TaskCompletionSource<string>? _imageMsg;

    // Second guard so a run never loops on the same station even if a write
    // hiccups. The durable record is the file on disk.
    private readonly HashSet<string> _completedSlugs = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Stations whose image was rendered in THIS session. Two jobs, and they are
    /// deliberately not the same set as _completedSlugs.
    ///
    /// It decides which rows carry the green tick, and it keeps those rows on
    /// screen after they are finished. Without the second part a completed
    /// station would vanish from the worklist the instant it succeeded, because
    /// it now has an image and the list hides those: the tick would never be seen.
    /// So a finished station stays, ticked, until Refresh is pressed.
    ///
    /// _completedSlugs is never cleared, because it stops a run looping. This is
    /// cleared by Refresh and by Rescan, which is what makes the ticked rows drop
    /// out on demand rather than on a timer.
    /// </summary>
    private readonly HashSet<string> _sessionDone = new(StringComparer.OrdinalIgnoreCase);

    // Guards for the auto-reveal above: _revealing suppresses the Checked
    // handler while the code sets the box, _showAllIsOperatorChoice records
    // that a human has since decided and the code should stop interfering.
    private bool _revealing;
    private bool _showAllIsOperatorChoice;

    /// <summary>
    /// One worklist row. The tick is a separate column so it can be coloured on
    /// its own, and the row CARRIES ITS STATION.
    ///
    /// That last part is not decoration. Selection resolved by taking the
    /// ListBox's index and re-deriving the visible list from the model plus the
    /// show-all checkbox is the same filter written twice and kept in step by
    /// hand: any drift points the preview at a different station than the one on
    /// screen. Holding the reference makes that impossible.
    /// </summary>
    private sealed class Row
    {
        public string Mark { get; init; } = "";
        public System.Windows.Media.Brush MarkBrush { get; init; } = System.Windows.Media.Brushes.Transparent;
        public string Title { get; init; } = "";
        public string Host { get; init; } = "";
        public Station? Station { get; init; }        // null on a placeholder row
        public override string ToString() => Title;   // keeps log lines readable
    }

    private static readonly System.Windows.Media.Brush TickFresh =
        new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0x3D, 0xD5, 0x6D));
    private static readonly System.Windows.Media.Brush TickOld =
        new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0x5a, 0x63, 0x74));
    private static readonly System.Windows.Media.Brush RowPlain =
        new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0x9a, 0xa0, 0xad));

    private const string CHATGPT = "https://chatgpt.com/";

    // Appended to every prompt so ChatGPT renders a wide image, not a square.
    //
    // ONE LINE, deliberately. This used to start with "\n\n" and that was a bug:
    // the composer is a ProseMirror contenteditable, execCommand('insertText')
    // splits on the blank line into separate paragraphs, and only the LAST
    // paragraph survived to be sent. The scene was silently dropped and ChatGPT
    // received nothing but the aspect-ratio instruction, which is not a request
    // for anything and failed the turn. Never reintroduce a newline here, and see
    // SubmitScript for the guard that now catches it.
    private const string AspectSuffix =
        " IMPORTANT: produce this image in a 16:9 widescreen landscape aspect ratio, " +
        "wide horizontal orientation, not square and not portrait.";

    public MainWindow()
    {
        InitializeComponent();
        ResolvePaths();
        LoadConfig();
        SiteRoot.Text = _siteRoot;
        ImagesRoot.Text = _imagesRoot;
        PersonasRoot.Text = _personasRoot;
        ArtworkRoot.Text = _artworkRoot;
        ChkPublish.IsChecked = _publishEnabled;
        PublishHost.Text = _publishHost;
        PublishKey.Text = _publishKey;
        PublishDir.Text = _publishDir;
        ApplyLayout();
        LoadPersonaPicker();
        FillHostPicker();
        LoadHostOverrides();
        Loaded += async (_, _) => await InitAsync();
        // Before the first render: applying placement after the window is on
        // screen makes it visibly jump from the default position to the saved one.
        SourceInitialized += (_, _) => Log("Window: " + WindowPlacement.Restore(this, _savedWindow));
        Closing += (_, _) => SaveLayout();
    }

    // ---- the rail ----------------------------------------------------------
    // Two views share one panel. The rail's RadioButtons are mutually exclusive
    // by GroupName, so this only has to answer "which one is on" rather than
    // track state of its own.
    //
    // Fires DURING InitializeComponent, because RailImages carries
    // IsChecked="True" in the markup and BAML sets that property while the window
    // is still being built.
    //
    // Which is why identity comes from `sender` and not from RailImages. The
    // generated field for a named element is assigned by Connect(), and for the
    // element currently being initialised that has not happened yet: reading
    // RailImages.IsChecked here throws a NullReferenceException on every launch,
    // inside InitializeComponent, so the app dies before showing a window.
    private void Rail_Checked(object sender, RoutedEventArgs e)
    {
        if (ViewImages == null || ViewSettings == null || PanelTitle == null) return;

        var which = (sender as FrameworkElement)?.Name ?? "";
        var images = which == "RailImages";

        ViewImages.Visibility = images ? Visibility.Visible : Visibility.Collapsed;
        ViewSettings.Visibility = images ? Visibility.Collapsed : Visibility.Visible;
        PanelTitle.Text = images ? "Station Images" : "Settings";
    }

    // ---- paths -------------------------------------------------------------
    // Walks up from the binary looking for THIS repo's marker
    // (tools/build-station-manifest.js, which no other site in the group has).
    // An unresolved root is not fatal: the defaults still point at W:\kJubilee.com
    // and the settings view can correct them.
    //
    // NOTE the deliberate absence of a cross-repo fallback. The JubiLujah
    // original defaulted to whichever repo it was written in when it could not
    // find its marker, so a stray copy wrote into that repo. A missing site root
    // here refuses to run and says which path it looked at.
    private void ResolvePaths()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "tools", "build-station-manifest.js"))) break;
            dir = dir.Parent;
        }
        _root = dir?.FullName ?? "";
        _siteRoot = _root.Length > 0 ? _root : DefaultSiteRoot;
        _toolDir = _root.Length > 0
            ? Path.Combine(_root, "tools", "StationImageStudio")
            : AppContext.BaseDirectory;
        _configFile = Path.Combine(_toolDir, "studio.config.json");
        _hostsFile = Path.Combine(_toolDir, "station-hosts.json");
        _imagesRoot = Path.Combine(_siteRoot, ImagesRelative);
        _personasRoot = Path.Combine(_siteRoot, PersonasRelative);

        // The WebView2 profile must live on a LOCAL disk. The tool directory is
        // normally on a mapped network share (W: -> \\HDC-INSPIRESERVER\Websites),
        // and Chromium does not support a user data folder on a network path: the
        // browser process faults with STATUS_IN_PAGE_ERROR (0xc0000006) the moment
        // the share goes stale, which kills the pane and then the app. Keep the
        // cookie store next to the user's other local app data instead.
        _userDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "kJubilee", "StationImageStudio", "webview2");
        Directory.CreateDirectory(_userDataFolder);
    }

    private string CatalogFile => Path.Combine(_siteRoot, CatalogRelative);

    // ---- config (git-ignored) ----------------------------------------------
    private void LoadConfig()
    {
        try
        {
            if (!File.Exists(_configFile)) return;
            var cfg = JsonNode.Parse(File.ReadAllText(_configFile));

            var s = cfg?["siteRoot"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(s)) _siteRoot = s.TrimEnd('\\', '/');
            var i = cfg?["imagesRoot"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(i)) _imagesRoot = i.TrimEnd('\\', '/');
            var p = cfg?["personasRoot"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(p)) _personasRoot = p.TrimEnd('\\', '/');
            var art = cfg?["artworkRoot"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(art)) _artworkRoot = art.TrimEnd('\\', '/');
            var sty = cfg?["includeStyle"]?.GetValue<bool>();
            if (sty is bool styleOn) ChkIncludeStyle.IsChecked = styleOn;
            var loc = cfg?["location"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(loc)) LocationUrl.Text = loc;

            // Absent means "on", so a config written before the host feature
            // existed does not silently turn it off.
            var pub = cfg?["publish"] as JsonObject;
            if (pub != null)
            {
                _publishEnabled = pub["enabled"]?.GetValue<bool>() ?? _publishEnabled;
                var ph = pub["host"]?.GetValue<string>();
                if (!string.IsNullOrWhiteSpace(ph)) _publishHost = ph.Trim();
                var pk = pub["keyPath"]?.GetValue<string>();
                if (!string.IsNullOrWhiteSpace(pk)) _publishKey = pk.Trim();
                var pd = pub["remoteDir"]?.GetValue<string>();
                if (!string.IsNullOrWhiteSpace(pd)) _publishDir = pd.Trim().TrimEnd('/');
                var pb = pub["publicBase"]?.GetValue<string>();
                if (!string.IsNullOrWhiteSpace(pb)) _publicBase = pb.Trim().TrimEnd('/');
            }

            var inc = cfg?["includeHost"]?.GetValue<bool>();
            if (inc is bool b) ChkIncludeHost.IsChecked = b;

            // Held, not applied. The HWND does not exist yet at LoadConfig time,
            // and SetWindowPlacement needs one. SourceInitialized applies it.
            _savedWindow = cfg?["window"] as JsonObject;

            var layout = cfg?["layout"];
            var pw = layout?["panelWidth"]?.GetValue<double>();
            var lh = layout?["logHeight"]?.GetValue<double>();
            if (pw is double savedWidth && savedWidth >= MinPanelWidth) _panelWidth = savedWidth;
            if (lh is double savedHeight && savedHeight >= MinLogHeight) _logHeight = savedHeight;
        }
        catch { /* a malformed config just means "start from defaults" */ }
    }

    private void BtnSaveCfg_Click(object sender, RoutedEventArgs e)
    {
        ReadRootsFromUi();
        // Fold the current splitter positions in too, so "Save settings" saves
        // what the window looks like as well as where it reads from.
        SaveLayout();
        Log("Settings saved → studio.config.json (git-ignored).");
    }

    private void WriteConfig()
    {
        try
        {
            var cfg = new JsonObject
            {
                ["siteRoot"] = _siteRoot,
                ["imagesRoot"] = _imagesRoot,
                ["personasRoot"] = _personasRoot,
                ["artworkRoot"] = _artworkRoot,
                ["includeStyle"] = ChkIncludeStyle.IsChecked == true,
                ["includeHost"] = ChkIncludeHost.IsChecked == true,
                ["publish"] = new JsonObject
                {
                    ["enabled"] = ChkPublish.IsChecked == true,
                    ["host"] = _publishHost,
                    ["keyPath"] = _publishKey,
                    ["remoteDir"] = _publishDir,
                    ["publicBase"] = _publicBase,
                },
                ["location"] = (LocationUrl.Text ?? "").Trim(),
                // Captured here rather than in Closing so it is written by every
                // path that saves settings, not only by a clean shutdown.
                ["window"] = WindowPlacement.Capture(this),
                ["layout"] = new JsonObject
                {
                    ["panelWidth"] = Math.Round(_panelWidth),
                    ["logHeight"] = Math.Round(_logHeight),
                },
            };
            Directory.CreateDirectory(_toolDir);
            File.WriteAllText(_configFile, cfg.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception ex) { Log("Could not save settings: " + ex.Message); }
    }

    private void ReadRootsFromUi()
    {
        _siteRoot = (SiteRoot.Text ?? "").Trim().TrimEnd('\\', '/');
        _imagesRoot = (ImagesRoot.Text ?? "").Trim().TrimEnd('\\', '/');
        _personasRoot = (PersonasRoot.Text ?? "").Trim().TrimEnd('\\', '/');
        var artIn = (ArtworkRoot.Text ?? "").Trim().TrimEnd('\\', '/');
        // Changing the root invalidates every cached cover list. Without this a
        // corrected path keeps serving the empty result of the wrong one, and the
        // symptom — "style reference off" on every render — points nowhere near
        // the cache.
        if (!string.Equals(artIn, _artworkRoot, StringComparison.OrdinalIgnoreCase)) _artworkCache.Clear();
        _artworkRoot = artIn.Length > 0 ? artIn : DefaultArtworkRoot;
        _publishEnabled = ChkPublish.IsChecked == true;
        _publishHost = (PublishHost.Text ?? "").Trim();
        _publishKey = (PublishKey.Text ?? "").Trim();
        var pdir = (PublishDir.Text ?? "").Trim().TrimEnd('/');
        if (pdir.Length > 0 && pdir != _publishDir) _remoteDirReady = false;
        _publishDir = pdir.Length > 0 ? pdir : DefaultPublishDir;
        if (_imagesRoot.Length == 0) _imagesRoot = Path.Combine(_siteRoot, ImagesRelative);
        if (_personasRoot.Length == 0) _personasRoot = Path.Combine(_siteRoot, PersonasRelative);
    }

    // ---- the remembered layout ---------------------------------------------

    private void ApplyLayout()
    {
        PanelCol.Width = new GridLength(Math.Max(MinPanelWidth, _panelWidth), GridUnitType.Pixel);
        LogRow.Height = new GridLength(Math.Max(MinLogHeight, _logHeight), GridUnitType.Pixel);
    }

    /// <summary>
    /// Write the current splitter positions back to studio.config.json.
    ///
    /// Runs on close, and again whenever settings are saved by hand. Zero and NaN
    /// are refused rather than stored: a window closed while minimised measures
    /// everything at zero, and writing that would reopen with both the panel and
    /// the log collapsed and no obvious way back.
    /// </summary>
    private void SaveLayout()
    {
        var w = PanelCol.ActualWidth;
        var h = LogRow.ActualHeight;
        if (w >= MinPanelWidth && !double.IsNaN(w)) _panelWidth = w;
        if (h >= MinLogHeight && !double.IsNaN(h)) _logHeight = h;
        WriteConfig();
    }

    // ---- the station catalog -----------------------------------------------

    /// <summary>
    /// Read the dial out of public/js/stations-data.js.
    ///
    /// That file is GENERATED by tools/build-home-data.js and says so in its own
    /// header, which is exactly why it is the right thing to read: it is the one
    /// artefact that carries every station with its programming type, language,
    /// region and assigned host already resolved. Parsing public/radio.html
    /// instead would mean re-implementing the enrichment pass that produced those
    /// fields, and the two implementations would drift.
    ///
    /// The parse is deliberately blunt. Every `window.KJ_* = [...]` assignment is
    /// emitted on ONE line by JSON.stringify, so taking the text between the
    /// first `[` and the trailing `];` of that line gives valid JSON. A cleverer
    /// parser would buy nothing and would fail differently.
    /// </summary>
    private bool LoadCatalog()
    {
        _stations.Clear();
        var file = CatalogFile;
        if (!File.Exists(file))
        {
            Log("✗ Station catalog not found: " + file);
            Log("  Check the site root in Settings. Nothing was loaded.");
            return false;
        }

        try
        {
            var json = ExtractAssignment(File.ReadAllText(file), "KJ_STATIONS");
            if (json == null) { Log("✗ No window.KJ_STATIONS assignment in " + file); return false; }

            var arr = JsonNode.Parse(json) as JsonArray;
            if (arr == null) { Log("✗ window.KJ_STATIONS is not an array."); return false; }

            foreach (var node in arr)
            {
                if (node is not JsonObject o) continue;
                var s = new Station
                {
                    Slug = Str(o, "slug"),
                    Name = Str(o, "name"),
                    Hm = Str(o, "hm"),
                    Freq = Str(o, "freq"),
                    Primary = Str(o, "primary"),
                    Format = Str(o, "format"),
                    Band = Str(o, "band"),
                    Lang = Str(o, "lang"),
                    Region = Str(o, "region"),
                    Description = Str(o, "description"),
                    CatalogHost = Str(o, "host"),
                    Order = o["order"]?.GetValue<int>() ?? 0,
                };
                if (o["show"] is JsonObject show) s.ShowName = Str(show, "name");
                if (s.Slug.Length == 0) continue;
                _stations.Add(s);
            }
            _stations.Sort((a, b) => a.Order.CompareTo(b.Order));
            return _stations.Count > 0;
        }
        catch (Exception ex)
        {
            Log("✗ Could not read the station catalog: " + ex.Message);
            return false;
        }
    }

    private static string Str(JsonObject o, string key) =>
        o[key] is JsonNode n && n.GetValueKind() == JsonValueKind.String ? n.GetValue<string>() : "";

    /// <summary>The JSON array literal assigned to window.&lt;name&gt;, or null.</summary>
    private static string? ExtractAssignment(string source, string name)
    {
        foreach (var line in source.Split('\n'))
        {
            var trimmed = line.TrimStart();
            if (!trimmed.StartsWith("window." + name, StringComparison.Ordinal)) continue;
            var open = trimmed.IndexOf('[');
            var close = trimmed.LastIndexOf(']');
            if (open < 0 || close <= open) return null;
            return trimmed.Substring(open, close - open + 1);
        }
        return null;
    }

    /// <summary>
    /// Group the loaded stations by programming type and rebuild the tab strip.
    ///
    /// The groups come from the catalog, not from a list kept here: KnownGroups
    /// only supplies the display names and the one-word headers, and a type it
    /// has never heard of still gets a tab with a derived label. That is the
    /// lesson from the InspireManna build, whose seven categories were hardcoded
    /// and which reported an empty site the first time it met a corpus with
    /// different ones.
    /// </summary>
    private void BuildGroupTabs()
    {
        var present = _stations.Select(s => s.Primary).Where(p => p.Length > 0)
                               .Distinct(StringComparer.OrdinalIgnoreCase).ToList();

        Groups = new List<(string, string, string)>();
        foreach (var (slug, display, header) in KnownGroups)
            if (present.Any(p => string.Equals(p, slug, StringComparison.OrdinalIgnoreCase)))
                Groups.Add((slug, display, header));
        // Anything the catalog has that KnownGroups does not, appended in the
        // order it appears rather than dropped.
        foreach (var p in present)
            if (!Groups.Any(g => string.Equals(g.Slug, p, StringComparison.OrdinalIgnoreCase)))
                Groups.Add((p, GroupLabel(p), ShortHeader(GroupLabel(p))));

        // Tab 0 is All and lives in the XAML; everything after it is rebuilt.
        while (Tabs.Items.Count > 1) Tabs.Items.RemoveAt(1);
        _listBySlug.Clear();
        _listBySlug[AllSlug] = LstAll;

        foreach (var (slug, display, header) in Groups)
        {
            var list = new ListBox { Style = (Style)FindResource("JobList") };
            list.SelectionChanged += StationList_SelectionChanged;
            Tabs.Items.Add(new TabItem
            {
                Header = header,
                Tag = slug,
                ToolTip = display,
                Content = list,
            });
            _listBySlug[slug] = list;
        }
        Tabs.SelectedIndex = 0;
    }

    /// <summary>"sleep_rest" with no entry in KnownGroups becomes "Sleep Rest".</summary>
    private static string GroupLabel(string slug)
    {
        var words = slug.Replace('_', ' ').Replace('-', ' ').Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return string.Join(' ', words.Select(w => char.ToUpperInvariant(w[0]) + w.Substring(1)));
    }

    /// <summary>A dozen headers share one strip inside a 344px panel, so they are one word.</summary>
    private static string ShortHeader(string label)
    {
        var first = label.Split(' ', '&', ',')[0].Trim();
        return first.Length > 0 ? first : label;
    }

    private string DisplayFor(string slug)
    {
        if (slug == AllSlug) return "All stations";
        foreach (var g in Groups) if (string.Equals(g.Slug, slug, StringComparison.OrdinalIgnoreCase)) return g.Display;
        return slug;
    }

    private ListBox ListFor(string slug) =>
        _listBySlug.TryGetValue(slug, out var l) ? l : LstAll;

    private string SelectedSlug()
    {
        var tab = Tabs.SelectedItem as TabItem;
        var tag = tab?.Tag as string;
        return string.IsNullOrEmpty(tag) ? AllSlug : tag;
    }

    // ---- the host assignment -----------------------------------------------
    //
    // Every station on the dial is fronted by one of the twelve. That assignment
    // arrives from the catalog, which derives it in tools/build-home-data.js from
    // a per-format rota plus a handful of deliberate overrides (Nova fronts the
    // flagship). This studio treats it as the default and never as the last word,
    // because the catalog is answering "who presents this station" and the studio
    // is answering "whose face is in this picture", and those can legitimately
    // differ for one station without the whole rota being rewritten.

    /// <summary>The twelve, in the order the site lists them.</summary>
    private static readonly (string Slug, string Name)[] Family =
    {
        ("nova", "Nova"), ("jubilee", "Jubilee"), ("melody", "Melody"), ("zariah", "Zariah"),
        ("caleb", "Caleb"), ("zev", "Zev"), ("imani", "Imani"), ("santiago", "Santiago"),
        ("tahoma", "Tahoma"), ("amir", "Amir"), ("elias", "Elias"), ("eliana", "Eliana"),
    };

    private static string FamilyNameFor(string slug)
    {
        foreach (var p in Family) if (string.Equals(p.Slug, slug, StringComparison.OrdinalIgnoreCase)) return p.Name;
        return "";
    }

    private void LoadHostOverrides()
    {
        _hostOverrides.Clear();
        try
        {
            if (!File.Exists(_hostsFile)) return;
            if (JsonNode.Parse(File.ReadAllText(_hostsFile)) is not JsonObject o) return;
            foreach (var kv in o)
            {
                var v = kv.Value?.GetValue<string>() ?? "";
                if (v.Length > 0 && FamilyNameFor(v).Length > 0) _hostOverrides[kv.Key] = v;
            }
        }
        catch { /* a malformed override file just means "use the catalog" */ }
    }

    private void WriteHostOverrides()
    {
        try
        {
            var o = new JsonObject();
            foreach (var kv in _hostOverrides.OrderBy(k => k.Key, StringComparer.Ordinal)) o[kv.Key] = kv.Value;
            Directory.CreateDirectory(_toolDir);
            File.WriteAllText(_hostsFile, o.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception ex) { Log("Could not save the host assignment: " + ex.Message); }
    }

    /// <summary>
    /// The persona for a station: the override if one was set here, otherwise the
    /// catalog's own. Never empty — a station the catalog left hostless still has
    /// to have a face, and one derived from its own frequency is at least stable
    /// across runs instead of being a different member every time.
    /// </summary>
    private string HostFor(Station s)
    {
        if (_hostOverrides.TryGetValue(s.Slug, out var over) && over.Length > 0) return over;
        if (s.CatalogHost.Length > 0 && FamilyNameFor(s.CatalogHost).Length > 0) return s.CatalogHost;
        return Family[Seed(s) % Family.Length].Slug;
    }

    private void FillHostPicker()
    {
        HostPicker.Items.Clear();
        foreach (var (slug, name) in Family)
            HostPicker.Items.Add(new ComboBoxItem { Content = $"{name} Inspire", Tag = slug });
    }

    private void HostPicker_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_syncingHost) return;
        var station = SelectedStation();
        if (station == null) return;
        var slug = (HostPicker.SelectedItem as ComboBoxItem)?.Tag as string ?? "";
        if (slug.Length == 0 || string.Equals(slug, station.Host, StringComparison.OrdinalIgnoreCase)) return;

        station.Host = slug;
        // An override that merely restates the catalog is not written: the file
        // should record decisions, not echo the generated default, or a rota
        // change in build-home-data.js would be silently pinned by every station
        // that had ever been looked at.
        if (string.Equals(slug, station.CatalogHost, StringComparison.OrdinalIgnoreCase)) _hostOverrides.Remove(station.Slug);
        else _hostOverrides[station.Slug] = slug;
        WriteHostOverrides();

        Log($"{station.Name} → hosted by {FamilyNameFor(slug)} Inspire"
            + (string.Equals(slug, station.CatalogHost, StringComparison.OrdinalIgnoreCase) ? " (back to the catalog's own)." : "."));
        RenderAll();
        ShowPreview(station);
    }

    /// <summary>Point the host picker at whatever the selected station carries.</summary>
    private void SyncHostPicker(Station? s)
    {
        _syncingHost = true;
        try
        {
            HostPicker.IsEnabled = s != null;
            if (s == null) { HostPicker.SelectedIndex = -1; return; }
            for (int i = 0; i < HostPicker.Items.Count; i++)
                if ((HostPicker.Items[i] as ComboBoxItem)?.Tag as string is string t &&
                    string.Equals(t, s.Host, StringComparison.OrdinalIgnoreCase))
                { HostPicker.SelectedIndex = i; return; }
            HostPicker.SelectedIndex = -1;
        }
        finally { _syncingHost = false; }
    }

    // ---- the two filters ----------------------------------------------------

    /// The header persona filter. Empty means "All Personas", which is the
    /// default and the only value that shows every voice.
    ///
    /// Applied in exactly two places, RenderList (what is shown) and Pending
    /// (what a run actually processes), because filtering only the first would
    /// leave Generate quietly working on stations the user had just filtered out
    /// of sight.
    private string _personaFilter = "";

    /// The header text filter. Same two places, same reason.
    private string _textFilter = "";

    private bool PersonaMatches(Station s) =>
        _personaFilter.Length == 0 ||
        string.Equals(s.Host, _personaFilter, StringComparison.OrdinalIgnoreCase);

    private bool TextMatches(Station s)
    {
        if (_textFilter.Length == 0) return true;
        return s.Name.Contains(_textFilter, StringComparison.OrdinalIgnoreCase)
            || s.Slug.Contains(_textFilter, StringComparison.OrdinalIgnoreCase)
            || s.Hm.Contains(_textFilter, StringComparison.OrdinalIgnoreCase)
            || s.Format.Contains(_textFilter, StringComparison.OrdinalIgnoreCase)
            || s.Lang.Contains(_textFilter, StringComparison.OrdinalIgnoreCase);
    }

    private bool InScope(Station s) => PersonaMatches(s) && TextMatches(s);

    private void LoadPersonaPicker()
    {
        PersonaPicker.Items.Clear();
        PersonaPicker.Items.Add(new ComboBoxItem { Content = "All Personas", Tag = "" });
        foreach (var (slug, name) in Family)
            PersonaPicker.Items.Add(new ComboBoxItem { Content = $"{name} Inspire", Tag = slug });
        PersonaPicker.SelectedIndex = 0;
    }

    private void PersonaPicker_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        var tag = (PersonaPicker?.SelectedItem as ComboBoxItem)?.Tag as string ?? "";
        if (tag == _personaFilter) return;
        _personaFilter = tag;
        if (!_ready) return;
        RenderAll();
        var who = _personaFilter.Length == 0 ? "all personas" : FamilyNameFor(_personaFilter) + " Inspire";
        Log($"Persona filter: {who} — {Pending(SelectedSlug()).Count} station(s) pending in this tab.");
    }

    private void StationFilter_TextChanged(object sender, TextChangedEventArgs e)
    {
        var text = (StationFilter?.Text ?? "").Trim();
        if (text == _textFilter) return;
        _textFilter = text;
        if (!_ready) return;
        RenderAll();
    }

    // ---- init WebView2 with a persistent profile (this is the cookie store) --
    /// <summary>
    /// Says which build is running, and shouts if the source is newer than it.
    ///
    /// THE TRAP THIS CLOSES, which cost two stations a render on 2026-08-23:
    /// `dotnet build` — the obvious command, and the one anyone reaching for a
    /// build will type — writes bin\Debug\net8.0-windows. Build-And-Run.cmd
    /// builds RELEASE into bin\Release\net8.0-windows-v2 and launches that. So
    /// a prompt can be edited, "built" successfully, and generated from anyway,
    /// with the old tables composing the picture and nothing anywhere saying so.
    /// Both first-century stations came back as a skate park and a car wash for
    /// exactly that reason: the running exe was two hours older than the entries
    /// meant to replace them.
    ///
    /// A silent staleness is the problem, so the answer is a line in the log at
    /// every startup rather than a cleverer build. Best effort throughout: this
    /// is a diagnostic, and a diagnostic that throws is worse than no diagnostic.
    /// </summary>
    private void ReportBuildAge()
    {
        try
        {
            var exeDir = AppContext.BaseDirectory;
            var dll = Path.Combine(exeDir, "StationImageStudio.dll");
            if (!File.Exists(dll)) return;
            var built = File.GetLastWriteTime(dll);
            Log("Running the build from " + built.ToString("yyyy-MM-dd HH:mm") +
                "  (" + Path.GetFileName(Path.TrimEndingDirectorySeparator(exeDir)) + ")");

            var srcDir = Path.Combine(_siteRoot, "tools", "StationImageStudio");
            if (!Directory.Exists(srcDir)) return;

            DateTime newest = DateTime.MinValue;
            string newestName = "";
            foreach (var f in Directory.EnumerateFiles(srcDir, "*.cs", SearchOption.TopDirectoryOnly))
            {
                if (f.EndsWith(".bak", StringComparison.OrdinalIgnoreCase)) continue;
                var t = File.GetLastWriteTime(f);
                if (t > newest) { newest = t; newestName = Path.GetFileName(f); }
            }
            // A minute of slack: the build writes its output a moment after it
            // reads the source, and on a mapped share the two clocks can differ
            // by a tick without anything being wrong.
            if (newest <= built.AddMinutes(1)) return;

            Log("");
            Log("  \u26a0 THE SOURCE IS NEWER THAN THIS BUILD.");
            Log("    " + newestName + " was edited " + newest.ToString("HH:mm") +
                ", this exe was built " + built.ToString("HH:mm") + ".");
            Log("    Anything generated now uses the OLD prompts. Close the studio and run");
            Log("    Build-And-Run.cmd — `dotnet build` alone writes bin\\Debug, which is not");
            Log("    the folder this app is launched from.");
            Log("");
        }
        catch { /* a diagnostic must never be the thing that breaks startup */ }
    }

    private async Task InitAsync()
    {
        try
        {
            // White (not the default black) so a slow/blank first paint never
            // shows as a black page.
            Wv.DefaultBackgroundColor = System.Drawing.Color.White;
            var env = await CoreWebView2Environment.CreateAsync(userDataFolder: _userDataFolder);
            await Wv.EnsureCoreWebView2Async(env);
            Wv.CoreWebView2.WebMessageReceived += OnWebMessage;
            // If the very first load fails or lands blank, retry once so the app
            // always comes up on ChatGPT rather than a black/blank page.
            Wv.CoreWebView2.NavigationCompleted += (s, e) =>
            {
                var url = Wv.CoreWebView2.Source ?? "";
                if (!_homeRetried && (!e.IsSuccess || url.Length == 0 || url.StartsWith("about:")))
                {
                    _homeRetried = true;
                    Wv.CoreWebView2.Navigate(CHATGPT);
                }
            };
            Wv.CoreWebView2.Navigate(CHATGPT);
            _ready = true;

            Log("kJubilee Station Image Studio — one picture per station on the dial.");
            Log("Every image is album cover artwork: the station's own Inspire Family host,");
            Log("alone and filling the frame in white headphones, lit gold, in the JubiLujah look.");
            Log("Images are written to " + _imagesRoot + " as <slug>.webp.");
            Log("Log in to ChatGPT in the browser, then pick a tab and generate.");
            ReportBuildAge();
            ScanAll();
            ReportReferenceCoverage();
            ReportArtworkCoverage();
        }
        catch (Exception ex)
        {
            Log("Init failed: " + ex.Message);
            MessageBox.Show(
                "WebView2 failed to start. Make sure the WebView2 Runtime is installed " +
                "(it ships with Edge on Windows 11).\n\n" + ex.Message,
                "Station Image Studio", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    // ---- scanning ------------------------------------------------------------

    private void BtnScan_Click(object sender, RoutedEventArgs e)
    {
        ReadRootsFromUi();
        _sessionDone.Clear();
        // Refresh means "re-read the drive", so the drive wins: a station whose
        // image was deleted since the last scan must become pending again, and
        // the completed-this-session lock would otherwise outlive the truth on
        // disk and keep refusing to touch it.
        _completedSlugs.Clear();
        ScanAll();
    }

    private void BtnReload_Click(object sender, RoutedEventArgs e)
    {
        ReadRootsFromUi();
        _sessionDone.Clear();
        _completedSlugs.Clear();
        ScanAll();
    }

    /// <summary>
    /// Re-read the catalog, re-resolve every host, and ask the disk which
    /// stations already have a picture.
    /// </summary>
    private void ScanAll()
    {
        CatalogPath.Text = "catalog: " + CatalogFile;

        if (!LoadCatalog()) { RenderAll(); return; }
        BuildGroupTabs();

        // SceneIndex is assigned in catalog order, counting within each scene
        // pool, so the eight European stations take eight different European
        // scenes rather than colliding on whichever two a hash happened to pick.
        var seen = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var s in _stations)
        {
            s.Host = HostFor(s);
            s.ImageFile = ExistingImage(s) ?? "";

            var key = ScenePoolKey(s);
            seen.TryGetValue(key, out var n);
            s.SceneIndex = n;
            seen[key] = n + 1;
        }

        _byGroup.Clear();
        foreach (var (slug, _, _) in Groups) _byGroup[slug] = new List<Station>();
        foreach (var s in _stations)
        {
            if (!_byGroup.TryGetValue(s.Primary, out var list)) { list = new List<Station>(); _byGroup[s.Primary] = list; }
            list.Add(s);
        }

        var done = _stations.Count(s => s.HasImage);
        var overridden = _stations.Count(s => _hostOverrides.ContainsKey(s.Slug));
        Log($"\nScanned {_stations.Count} station(s) across {Groups.Count} programming type(s): "
            + $"{done} with an image, {_stations.Count - done} pending.");
        if (overridden > 0) Log($"  {overridden} station(s) carry a host assignment set here rather than by the catalog.");
        AutoRevealWhenNothingPending();
        RenderAll();
    }

    /// <summary>
    /// The rendered file for a station, or null.
    ///
    /// WebP first because that is what this tool writes, then the raster formats
    /// ToWebp falls back to when a conversion fails. Checking only .webp would
    /// requeue a station whose image is a perfectly good .png and regenerate it
    /// forever.
    /// </summary>
    private string? ExistingImage(Station s)
    {
        foreach (var ext in new[] { WebpExt, ".png", ".jpg", ".jpeg" })
        {
            var name = s.Slug + ext;
            if (File.Exists(Path.Combine(_imagesRoot, name))) return name;
        }
        return null;
    }

    private void ReportReferenceCoverage()
    {
        if (ChkIncludeHost.IsChecked != true) return;
        var missing = new List<string>();
        foreach (var (slug, name) in Family)
            if (ReferencePathFor(slug) == null) missing.Add(name);

        if (missing.Count == 0)
        {
            Log($"Host portraits: all twelve found in {_personasRoot}.");
            return;
        }
        Log($"⚠ Host portraits: {12 - missing.Count} of 12 found in {_personasRoot}.");
        Log("  Missing: " + string.Join(", ", missing));
        Log("  Every station hosted by one of those is skipped rather than imaged without its host.");
    }

    // ---- the worklists -------------------------------------------------------

    private void ChkShowAll_Click(object sender, RoutedEventArgs e)
    {
        // An operator who touches the box owns it from then on. Without this,
        // the next scan would helpfully tick it again and undo the choice.
        if (!_revealing) _showAllIsOperatorChoice = true;
        RenderAll();
    }

    /// <summary>
    /// Tick "Show stations with images" when a scan finds nothing pending.
    ///
    /// The worklist is a BACKLOG view, and a backlog view of an empty backlog
    /// is a blank panel — which is what the operator saw with all 104 stations
    /// finished: every tab empty, nothing selectable, and therefore no way to
    /// reach "Regenerate this image", which only appears once a station is
    /// selected. The tool looked broken at precisely the moment its work was
    /// complete.
    ///
    /// Ticking the real control, rather than special-casing the list, is what
    /// keeps the panel and the checkbox telling the same story. It only ever
    /// turns the box ON, it never runs twice over an operator who set it by
    /// hand, and the log says it happened so nothing is mysterious.
    /// </summary>
    private void AutoRevealWhenNothingPending()
    {
        if (_showAllIsOperatorChoice) return;
        if (ChkShowAll.IsChecked == true) return;
        if (_stations.Count == 0) return;
        if (_stations.Any(s => !s.HasImage)) return;   // a real backlog: leave the worklist alone

        _revealing = true;
        try { ChkShowAll.IsChecked = true; }
        finally { _revealing = false; }
        Log("  Every station has an image, so the full roster is shown — select one to regenerate it.");
    }

    private void RenderAll()
    {
        RenderList(AllSlug);
        foreach (var (slug, _, _) in Groups) RenderList(slug);
        UpdateCount();
        UpdateScopeNote();
    }

    private List<Station> Visible(string slug)
    {
        IEnumerable<Station> source = slug == AllSlug
            ? _stations
            : (_byGroup.TryGetValue(slug, out var list) ? list : Enumerable.Empty<Station>());

        // Ticked: every station in scope. Unticked: only what still needs an
        // image, plus anything finished in THIS session so a row does not
        // vanish out from under the operator the moment it completes.
        var rows = ChkShowAll.IsChecked == true
            ? source.Where(InScope)
            : source.Where(InScope).Where(s => !s.HasImage || _sessionDone.Contains(s.Slug));

        return rows.OrderBy(DialPosition).ThenBy(s => s.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
    }

    /// <summary>
    /// A station's place on the dial, as a number.
    ///
    /// Hm is a display string ("088.70", "399.18"), so the strings cannot be
    /// compared directly — "88.70" would sort after "399.18" the moment a
    /// frequency loses its leading zero. Parsed invariantly, because the
    /// catalog writes a dot and a machine set to a comma locale would read
    /// 399.18 as 39918 and throw the whole list out of order.
    ///
    /// Anything unparseable sorts last rather than to zero: a malformed
    /// frequency at the END of the list looks like the anomaly it is, where at
    /// the top it would look like the dial starts there.
    /// </summary>
    private static double DialPosition(Station s) =>
        double.TryParse(s.Hm, System.Globalization.NumberStyles.Float,
                        System.Globalization.CultureInfo.InvariantCulture, out var v)
            ? v : double.MaxValue;

    private void RenderList(string slug)
    {
        var box = ListFor(slug);
        var keep = (box.SelectedItem as Row)?.Station;
        box.Items.Clear();

        var visible = Visible(slug);
        if (visible.Count == 0)
        {
            // Say which of the three reasons this is, because the fix differs:
            // load a catalog, widen the filter, or tick the box to reach the
            // stations that are already done.
            var why = "no stations match this filter";
            if (_stations.Count == 0) why = "no catalog loaded";
            else if (ChkShowAll.IsChecked != true && _stations.Any(InScope))
                why = "nothing pending — tick \u201cShow stations with images\u201d to regenerate one";
            box.Items.Add(new Row { Title = why, MarkBrush = RowPlain });
            return;
        }

        foreach (var s in visible)
        {
            var fresh = _sessionDone.Contains(s.Slug);
            box.Items.Add(new Row
            {
                Mark = s.HasImage ? "✓" : "",
                MarkBrush = fresh ? TickFresh : TickOld,
                Title = $"{s.Freq}  {s.Name}",
                Host = FamilyNameFor(s.Host),
                Station = s,
            });
        }

        if (keep != null)
        {
            for (int i = 0; i < box.Items.Count; i++)
                if (ReferenceEquals((box.Items[i] as Row)?.Station, keep)) { box.SelectedIndex = i; break; }
        }
    }

    private void UpdateCount()
    {
        var shown = _stations.Count(InScope);
        StationCount.Text = shown == _stations.Count ? $"{_stations.Count}" : $"{shown} / {_stations.Count}";
    }

    private void UpdateScopeNote()
    {
        if (_stations.Count == 0) { ScopeNote.Text = ""; return; }
        var slug = SelectedSlug();
        var pending = Pending(slug).Count;
        ScopeNote.Text = pending == 0
            ? $"Every station in {DisplayFor(slug)} has an image — select one to regenerate it."
            : $"{pending} pending in {DisplayFor(slug)}.";
    }

    private void Tabs_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!ReferenceEquals(sender, Tabs)) return;   // a child ListBox bubbling its own event
        if (!_ready) return;
        UpdateScopeNote();
        ShowPreview(SelectedStation());
    }

    // ---- the preview ---------------------------------------------------------

    /// <summary>
    /// The station the selected row IS, straight off the row. No index maths and
    /// no second derivation of the visible list, so what the preview shows and
    /// what the list shows cannot disagree.
    /// </summary>
    private Station? SelectedStation() => (ListFor(SelectedSlug()).SelectedItem as Row)?.Station;

    private void StationList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        // Only the list that is actually on screen drives the preview. Rendering
        // a worklist clears and refills it, which fires SelectionChanged on every
        // hidden tab too, and each of those would otherwise blank the preview the
        // user is looking at.
        if (!ReferenceEquals(sender, ListFor(SelectedSlug()))) return;
        ShowPreview(SelectedStation());
    }

    /// <summary>
    /// Put the selected station's rendered image in the preview.
    ///
    /// Loaded with CacheOption.OnLoad and a stream that is disposed immediately,
    /// which matters more here than it looks: the default is to keep the file
    /// open behind the BitmapImage, and this folder is the one the generator
    /// writes into. A held handle would make the next render of the same station
    /// fail on a locked file, and it would fail at the moment of saving, after
    /// the turn had already been spent.
    /// </summary>
    private void ShowPreview(Station? s)
    {
        // The regenerate link tracks the preview, not the list: they are the same
        // selection, and driving it from one place keeps them from disagreeing.
        RegenRow.Visibility = s is { HasImage: true } ? Visibility.Visible : Visibility.Collapsed;
        SyncHostPicker(s);

        PreviewImage.Source = null;

        if (s == null)
        {
            PreviewEmpty.Text = "Select a station to preview its image";
            PreviewCaption.Text = "";
            return;
        }

        PreviewCaption.Text = $"{s.Freq}  {s.Name} · {s.Format} · hosted by {FamilyNameFor(s.Host)}";

        if (!s.HasImage) { PreviewEmpty.Text = "No image yet"; return; }

        var file = Path.Combine(_imagesRoot, s.ImageFile);
        if (!File.Exists(file))
        {
            PreviewEmpty.Text = "the scan found a file that is no longer there";
            return;
        }

        try
        {
            var (bmp, w, h) = LoadPreview(file);
            PreviewImage.Source = bmp;
            PreviewEmpty.Text = "";
            PreviewCaption.Text = $"{s.Name}   ({w}x{h})   hosted by {FamilyNameFor(s.Host)}";
        }
        catch (Exception ex)
        {
            PreviewEmpty.Text = "Could not read the image";
            PreviewCaption.Text = ex.Message;
        }
    }

    /// <summary>
    /// Decode a station image for the preview, and return its true dimensions.
    ///
    /// DECODED THROUGH IMAGESHARP, NOT WPF. Station images are WebP, and WPF's
    /// BitmapImage cannot read WebP on this machine: WIC has no registered
    /// decoder for it, so EndInit throws ArgumentNullException "Key cannot be
    /// null" from the codec lookup, which is an unhelpfully generic way of saying
    /// "no codec". ImageSharp is already a dependency here, and is what wrote
    /// these files in the first place, so it is guaranteed to read them.
    ///
    /// Downscaled on the way through. The panel is a few hundred pixels wide and
    /// the source is 1024 or more; decoding full size for every click would hold
    /// far more memory than the preview can ever show.
    ///
    /// The intermediate is PNG because that is a format WPF certainly does read.
    /// </summary>
    private static (System.Windows.Media.Imaging.BitmapImage Image, int Width, int Height) LoadPreview(string file)
    {
        using var src = SixLabors.ImageSharp.Image.Load(File.ReadAllBytes(file));
        var trueW = src.Width;
        var trueH = src.Height;

        if (src.Width > PreviewMaxWidth)
        {
            src.Mutate(x => x.Resize(new SixLabors.ImageSharp.Processing.ResizeOptions
            {
                Mode = SixLabors.ImageSharp.Processing.ResizeMode.Max,
                Size = new SixLabors.ImageSharp.Size(PreviewMaxWidth, PreviewMaxWidth),
            }));
        }

        using var ms = new MemoryStream();
        src.Save(ms, new SixLabors.ImageSharp.Formats.Png.PngEncoder());
        ms.Position = 0;

        var bmp = new System.Windows.Media.Imaging.BitmapImage();
        bmp.BeginInit();
        bmp.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
        bmp.StreamSource = ms;
        bmp.EndInit();
        bmp.Freeze();
        return (bmp, trueW, trueH);
    }

    private const int PreviewMaxWidth = 720;

    /// <summary>
    /// Delete the selected station's image and generate it again.
    ///
    /// The one action the worklist cannot express: a finished station is filtered
    /// out of the queue by design, so without this the only way to redo a picture
    /// is to delete the file by hand and rescan. The delete comes FIRST and the
    /// station is only queued if it succeeded — a regeneration that quietly wrote
    /// nothing because the old file was locked would look identical to one that
    /// worked.
    /// </summary>
    private async void Regenerate_Click(object sender, RoutedEventArgs e)
    {
        var s = SelectedStation();
        if (s == null || !s.HasImage) return;
        if (!EnsureReady()) return;
        if (_running) { Log("A run is already going — Stop it first."); return; }

        var file = Path.Combine(_imagesRoot, s.ImageFile);
        var answer = MessageBox.Show(
            $"Delete {s.ImageFile} and generate a new image for {s.Name}?",
            "Regenerate", MessageBoxButton.OKCancel, MessageBoxImage.Question);
        if (answer != MessageBoxResult.OK) return;

        try { if (File.Exists(file)) File.Delete(file); }
        catch (Exception ex) { Log($"✗ Could not delete {file}: {ex.Message}"); return; }

        s.ImageFile = "";
        _completedSlugs.Remove(s.Slug);
        _sessionDone.Remove(s.Slug);
        RenderAll();
        ShowPreview(s);
        Log($"\n=== Regenerating {s.Name} ===");
        await RunBatch(new List<Station> { s });
    }

    // ========================================================================
    // THE PROMPT
    // ========================================================================
    //
    // An article carried its own image_prompt and this tool only had to read it.
    // A station carries nothing of the kind, so the scene is composed here from
    // what the catalog does know: the programming type, the language, the region,
    // the format and the station's own name.
    //
    // DETERMINISTIC, seeded off the HM frequency. Every choice below that has
    // more than one candidate — the device, the setting, who is listening, the
    // hour of day — is indexed by a number derived from the station's own
    // frequency digits, which is the same trick tools/build-home-data.js uses to
    // vary each station's ident gradient. Same station, same picture, every
    // build. That matters for a regeneration: pressing "Regenerate this image"
    // after a bad render should get another attempt at THE SAME PICTURE, not a
    // draw from a fresh lottery, or comparing the two tells you nothing.
    //
    // THE WHITE EQUIPMENT IS THE THROUGH LINE. A hundred and two stations across
    // twenty-five languages and eleven programming types have nothing else
    // visually in common, and a shelf of covers with nothing in common reads as
    // stock photography. White headphones, a white portable radio, a white
    // bedside set: one constant object, in every frame, in every country.

    /// <summary>
    /// A stable non-negative number for a station, from its HM frequency.
    ///
    /// The frequency is the station's identity on this dial and never changes, so
    /// it is the right seed. The slug's hash is the fallback for a station with
    /// no frequency; string.GetHashCode is NOT used because it is randomised per
    /// process in .NET Core and would give a different picture every launch.
    /// </summary>
    private static int Seed(Station s)
    {
        var digits = new string(s.Hm.Where(char.IsDigit).ToArray());
        if (digits.Length > 0 && int.TryParse(digits, out var n)) return Math.Abs(n);
        int h = 17;
        foreach (var c in s.Slug) h = unchecked(h * 31 + c);
        return Math.Abs(h);
    }

    /// <summary>
    /// A stable hash of a string. FNV-1a, salted per axis.
    ///
    /// NOT string.GetHashCode: that is randomised per process in .NET Core, so a
    /// station would draw a different scene on every launch and "Regenerate this
    /// image" would compare two unrelated pictures.
    /// </summary>
    private static uint Hash(string text, uint salt)
    {
        unchecked
        {
            uint h = 2166136261u ^ salt;
            foreach (var c in text) { h ^= c; h *= 16777619u; }
            return h;
        }
    }

    /// <summary>
    /// One entry from a pool, chosen by the station's slug on a given axis.
    ///
    /// Each axis gets its own salt so two axes never move together — without
    /// that, every station whose scene came out of slot 3 would also take the
    /// light from slot 3 and the camera from slot 3, and a hundred pictures
    /// would collapse into as many distinct looks as the shortest pool has
    /// entries.
    /// </summary>
    private static string Pick(string[] options, Station s, int axis) =>
        options.Length == 0 ? "" : options[(int)(Hash(s.Slug, (uint)(axis + 1) * 0x9E3779B9u) % (uint)options.Length)];

    /// <summary>
    /// The scene, taken by ROTATION rather than by hash.
    ///
    /// This is the axis the eye actually reads, and the one the last build got
    /// wrong: hashing thirty international stations into two regional scenes
    /// each produced fifteen stations that were the same photograph. SceneIndex
    /// is a station's position among the stations sharing its pool, so as long
    /// as the pool is at least as long as the group, no two stations in it can
    /// land on the same place. Every pool below is sized against its group for
    /// exactly that reason.
    ///
    /// The cost is that inserting a station mid-catalog shifts the scenes of the
    /// ones after it. That is harmless in practice: a rendered image is already
    /// on disk under its own slug and is never regenerated unless deleted.
    /// </summary>
    private static string Scene(string[] options, Station s) =>
        options.Length == 0 ? "" : options[s.SceneIndex % options.Length];

    /// <summary>
    /// Which pool a station draws its scene from — its LANGUAGE abroad, its
    /// programming type at home. SceneIndex counts within this key.
    ///
    /// Language and not region, and that distinction was a bug before it was a
    /// design: keyed by region, the thirty international stations rotated through
    /// a mixed continental pool and the Mandarin station drew a Tokyo crossing.
    /// A station broadcasting in Mandarin has to be somewhere Mandarin is spoken;
    /// "Asia" is not a place. No language on the dial carries more than two
    /// stations, so four scenes each is room to spare.
    ///
    /// A language with no pool of its own falls back to its region's, and two
    /// such languages in one region could then collide — every language the
    /// catalog currently carries has its own pool, so that is a note for whoever
    /// adds the thirty-first station rather than a live problem.
    /// </summary>
    private static string ScenePoolKey(Station s) =>
        s.Region.Length > 0 && s.Region != "domestic"
            ? "lang:" + (s.Lang.Length > 0 ? s.Lang : s.Region)
            : "primary:" + s.Primary;

    // ---- the scenes ---------------------------------------------------------
    //
    // A PLACE THAT IS ALREADY DOING SOMETHING. Every entry names somewhere with
    // its own life running through it — a tram going past, nets being mended,
    // dryers spinning — because that life is what the un-headphoned people in the
    // frame are busy with, and a scene that does not supply it comes back as a
    // row of people standing still.
    //
    // Sized against the group: mainstream carries twenty stations and has twenty
    // scenes, bible studies thirteen and has fourteen. See Scene().

    // ---- bespoke stations ----------------------------------------------------
    //
    // Scenes are normally chosen from a pool by format and hashed on the slug, so
    // a hundred stations get a hundred different backdrops without anyone writing
    // a hundred prompts. A few stations are not generic, though: the picture IS
    // the brief. Those are written out here, keyed by slug.
    //
    // Company matters as much as scene. The standard prompt insists the host is
    // the only person in frame — that rule exists because early runs came back as
    // uniformed crowds. Two of these stations need the opposite: a choir behind
    // the host, angels either side of him. CompanyFor supplies a replacement for
    // the solo clause, and only these stations get one.
    /// <param name="Subject">
    /// Replaces "a single figure, {who}, alone and filling the frame" for a
    /// station whose picture is not one persona. The solo opening is REPLACED
    /// rather than softened, for the same reason Company is: a contradicting
    /// sentence left in place is a sentence the model gets to choose between.
    /// </param>
    /// <param name="Who">
    /// What the later sentences call the subject — "Each girl" where the
    /// picture has two. Defaults to the persona's first name.
    /// </param>
    /// <param name="StyleFrom">
    /// Which catalogue the STYLE reference should be drawn from, when it is not
    /// the host persona's. A station whose subject is not a persona still wants
    /// the house look, and it should come from the music it actually plays.
    /// </param>
    /// <param name="NoPortrait">
    /// Suppresses the persona likeness attachment. Set it only when the subject
    /// is NOT someone on the roster: attaching a portrait is an instruction to
    /// paint that face, so it must not be sent for a picture of, say, two
    /// children. A persona standing in a crowd still wants their portrait.
    /// </param>
    /// <param name="Wardrobe">
    /// Replaces the garments HostClause would otherwise name out of WardrobeFor.
    ///
    /// The persona wardrobe table is canonical and modern — a dark jacket and
    /// trousers for Elias, a floor length dress and shoes for Jubilee — which is
    /// right for the ninety-odd stations set in the present day and wrong for a
    /// station set two thousand years before any of it existed. Leaving the table
    /// sentence in place beside a first-century scene does not produce an
    /// interesting tension; it produces two instructions about the same clothes,
    /// and the model picks one. On the two period stations it would also put a
    /// SECOND modern object in a frame whose entire point is that there is
    /// exactly one.
    ///
    /// So it is replaced rather than argued with, like Subject and Company. The
    /// modesty sentence that follows it in HostClause is untouched and still
    /// applies: an override changes the century, never the standard.
    /// </param>
    private sealed record Bespoke(string Scene, string Pose, string? Company,
                                  string? Subject = null, string? Who = null,
                                  string? StyleFrom = null, bool NoPortrait = false,
                                  string? Wardrobe = null);

    private static readonly Dictionary<string, Bespoke> BespokeStations = new(StringComparer.OrdinalIgnoreCase)
    {
        // HM 335.16 Gospel Country — Elias, and he is a cowboy, not a man near a horse.
        ["country-gospel"] = new(
            "wide open Western range at golden hour, a split-rail fence running out to distant mesas, " +
            "dust hanging in the low light and a saddled horse standing off to one side",
            "dressed as a working cowboy — wide-brimmed felt hat, worn leather boots, denim and a " +
            "buckled belt — caught mid-stride with one thumb hooked in {P} belt, coat moving with the step",
            null),

        // HM 339.18 Pentecostal Shout — Imani inside the choir, not in front of it.
        ["jubilee-gospel-fire"] = new(
            "the front of a packed Pentecostal sanctuary, a full robed gospel choir banked up the risers " +
            "behind, a Hammond organ and drum kit to one side, hands up across the whole room",
            "mid-shout with {P} head back and both hands raised, caught in the middle of the choir rather " +
            "than in front of it, robe and hair moving with the sound",
            "IMANI IS IN THE MIDDLE OF THE CHOIR AND THE CHOIR IS PART OF THE PICTURE: robed singers " +
            "close around and behind {O}, faces lit and mouths open mid-note. {SU} IS THE ONLY PERSON " +
            "WEARING HEADPHONES — no one else in the choir or the congregation wears any."),

        // HM 329.12 Jubilee Kids Party — two children, not a family persona.
        //
        // The only station on the dial whose picture has two equal subjects, and
        // the reason Subject/Who exist. Its host is Party Giggles, a catalogue
        // rather than a person, so the composer would otherwise fall back to
        // "one person" and render an anonymous adult — which is what the first
        // picture was.
        //
        // Ages and clothing are stated because this is the one card showing
        // children: young, plainly children, and dressed as children at a party
        // at home. The modesty rule the family personas follow applies here with
        // more force, not less.
        ["jubilee-kids-party"] = new(
            "a family living room dressed for a party — paper bunting strung along the wall, balloons " +
            "drifting across the rug, cupcakes and paper cups on a low table, a small speaker on the " +
            "shelf and tall windows behind pouring in the afternoon",
            "dressed for a party in modest, playful clothes — bright party dresses with sleeves and high " +
            "necklines, ribbons in their hair, socks on the rug — and caught mid-dance and laughing: the " +
            "blonde girl spinning with both arms up, the brown-haired girl bouncing on the rug beside " +
            "her, hair and hems flying",
            "THE TWO GIRLS ARE THE ONLY PEOPLE IN THE PICTURE: no adults, no other children, nobody in " +
            "the background or through the windows. BOTH GIRLS ARE WEARING THE WHITE HEADPHONES and " +
            "there is nobody else in frame who could be wearing any. They are plainly children, about " +
            "six to eight years old, and they are delighted — grinning at each other mid-dance, not " +
            "posing for the camera.",
            "two young girls together, side by side and filling the frame — one with bright blonde hair, " +
            "one with brown hair, both about six to eight years old and both smiling",
            "Each girl",
            // STYLE ONLY, and Melody rather than the host. Party Giggles has no
            // album artwork in the artwork tree, and the style attachment is a
            // cover — the house look — not a face, so taking it from the
            // family-friendly persona costs nothing and keeps the card looking
            // like the rest of the dial. No portrait is attached either way.
            "melody",
            NoPortrait: true),

        // HM 345.24 The Ancient Paths — Amir inside the dabke line. A joined-hands
        // line, not a ring: that is how the dance actually goes in his region, and
        // getting it wrong would read as costume rather than home.
        ["ancient-paths"] = new(
            "a warm stone courtyard at dusk, arched doorways and hanging lanterns, " +
            "long tables cleared to the walls and the desert light going amber on the " +
            "far wall",
            "mid-step in a joined-hands dabke line, one foot stamping and shoulder " +
            "dipped into the turn, {P} face bright with the joy of it",
            "{SU} IS DANCING IN A LINE OF MIDDLE-EASTERN BELIEVERS AND THE DANCE IS " +
            "THE PICTURE: men and women of all ages linked shoulder to shoulder on " +
            "either side of {O}, stamping in step, an oud player and a hand-drummer " +
            "at the end of the line. {SU} IS THE ONLY ONE WEARING HEADPHONES — " +
            "nobody else in the line wears any."),

        // HM 379.14 Midnight Praise — Nova inside a Celtic circle dance. Her lane is
        // Celtic/European ambient, so the ring is a ceilidh rather than a powwow,
        // and the hour is late because the station is the overnight watch.
        ["midnight-praise"] = new(
            "a windswept headland at blue hour, a bonfire burning low, standing stones " +
            "and the sea far below catching the last of the light",
            "mid-turn in a joined-hands ring, skirt and hair flying out with the spin, " +
            "{P} face lit from below by the fire and open with quiet joy",
            "{SU} IS DANCING IN A CIRCLE OF BELIEVERS AND THE CIRCLE IS THE PICTURE: " +
            "people of all ages holding hands around {O}, mid-step in a ceilidh ring, " +
            "wool and linen moving with them, a fiddler and a bodhran player at the " +
            "fire's edge. {SU} IS THE ONLY ONE WEARING HEADPHONES — nobody else in the " +
            "ring wears any."),

        // HM 347.14 Riddim and Rhyme — Zariah in the middle of the dance, not fronting it.
        ["riddim-and-rhyme"] = new(
            "an open-air Caribbean yard party at golden hour, corrugated roofs and " +
            "palms against the sky, a speaker stack to one side and bunting strung " +
            "between the posts",
            "mid-dance with {P} weight low and hips turned, one arm thrown up and " +
            "{P} head back laughing, braids and skirt swinging out with the beat",
            "{SU} IS DANCING IN A CROWD OF CARIBBEAN BELIEVERS AND THE DANCE IS THE " +
            "PICTURE: people of all ages moving close around {O}, hands in the air, " +
            "wine-and-dip and skank steps, a drummer and a horn player at the edge of " +
            "the frame, everyone mid-motion and laughing. {SU} IS THE ONLY ONE WEARING " +
            "HEADPHONES — nobody else in the crowd wears any."),

        // HM 399.18 Hawaiian Praise — the persona inside the island gathering,
        // one of the circle rather than a figure observed by it.
        //
        ["island-hallelujah"] = new(
            "a Hawaiian beach at golden hour — coconut palms leaning over pale sand, green " +
            "volcanic ridges and a waterfall valley rising behind, plumeria and hibiscus in " +
            "flower, an outrigger canoe drawn up on the shore and the surf breaking bright " +
            "beyond, tiki torches already lit along the sand",
            "mid-song with an 'ukulele up against {P} chest, weight rocking onto one foot " +
            "and {P} face open with the joy of it",
            "{SU} IS SINGING INSIDE A CIRCLE OF PACIFIC ISLAND BELIEVERS AND THE GATHERING " +
            "IS THE PICTURE: families of all ages around {O} — lei and aloha prints, hula " +
            "dancers mid-motion with hands telling the words — with slack-key guitar and " +
            "ipu gourd drum players to one side. {SU} IS THE ONLY ONE WEARING HEADPHONES — " +
            "no singer, dancer or player wears any."),

        // HM 377.70 Hebraic Celebrations — Zev inside the circle dance, not leading
        // it. The joy of the feast is the subject; he is one of the dancers.
        // HM 377.70 Hebraic Celebrations — Zev inside the hora, not beside it.
        //
        // Deliberately not the same picture as his other station. Both are now
        // Jerusalem, so the difference is carried by what is happening: this one
        // is a moving circle at a feast, Torah Sings is a gathering held still
        // by a song above the Old City. Same persona, same white headphones.
        //
        // Two additions over the first draft, both about the circle READING as
        // one. Left to itself the model paints a line of people standing behind
        // the subject, so the ring is stated as continuing past both edges of
        // the frame and the near dancers as caught with their feet off the
        // ground. And the Subject replaces "alone and filling the frame", which
        // otherwise sits in the same prompt as a circle of dancers and lets the
        // model choose between them.
        ["hebraic-celebrations"] = new(
            "a warm stone courtyard at a feast-day celebration, strings of bulbs criss-crossed " +
            "overhead, long tables pushed back against the walls, a violin and a clarinet going hard " +
            "off to one side and the last of the sun on the far wall",
            "mid-dance in the joined-hands circle with one foot lifted and {P} head thrown back " +
            "laughing, arms across the shoulders of the dancers either side of {O}, coat and hair " +
            "swinging out with the turn of the ring",
            "{SU} IS DANCING IN A CIRCLE OF MESSIANIC BELIEVERS AND THE CIRCLE IS THE PICTURE: " +
            "men and women of all ages holding hands around {O}, mid-step, tzitzit and skirts " +
            "swinging, faces lit and laughing with {O}, some heads covered. The ring carries on past " +
            "both edges of the frame so it reads as a whole celebration rather than a few people " +
            "standing near each other, and the dancers nearest the camera are caught with their feet " +
            "off the ground. {SU} IS THE ONLY ONE WEARING HEADPHONES — no one else in the circle " +
            "wears any.",
            "a single figure, Zev, in the middle of a ring of dancers and filling the frame"),

        // HM 305.12 Torah Sings — Zev singing over Jerusalem, people around him.
        //
        // The other Zev station, and still deliberately not the same picture:
        // Hebraic Celebrations is a moving circle at night in a courtyard, this
        // one is a gathering held still by a song, high over the Old City with
        // the dome behind. Dancing there, singing here.
        //
        // The dome is named explicitly and placed BEHIND him. Left to itself the
        // model will happily put a golden dome beside the subject or crop it out
        // of frame, and the skyline is the whole reason this station is not the
        // sanctuary it used to be.
        ["jubilee-praise"] = new(
            "a high stone overlook above Jerusalem at golden hour, the Old City stacked below in pale " +
            "limestone and the great golden dome rising clearly on the skyline BEHIND the subject, " +
            "cypress trees and a low parapet at the edges, the last of the sun coming across the rooftops",
            "caught mid-phrase in full voice with {P} head lifted, mouth open singing and eyes half " +
            "closed, one hand raised open at shoulder height, a prayer shawl over {P} shoulders lifting " +
            "in the warm wind",
            "{SU} IS SINGING IN THE MIDDLE OF A GATHERING OF WORSHIPPERS AND THE GATHERING IS PART OF " +
            "THE PICTURE: men and women close around and behind {O}, many with heads covered and prayer " +
            "shawls over their shoulders, faces lit, mouths open mid-note and hands raised. They stand " +
            "near enough to read as one company singing together rather than a few figures placed behind " +
            "{O}, and the gathering carries on past both edges of the frame. {SU} IS THE ONLY ONE " +
            "WEARING HEADPHONES — nobody else in the gathering wears any.",
            "a single figure, Zev, in the middle of a gathering of worshippers and filling the frame"),

        // ---- the two period stations -------------------------------------
        //
        // ONE MODERN OBJECT IN A FIRST-CENTURY WORLD, and it is on the host's
        // head. Everything else in both pictures — the buildings, the clothes,
        // the tools, the light, the people — is of the first century, and the
        // white headphones are the single thing that cannot possibly be there.
        // That is the whole idea, and it only works if it is the ONLY exception:
        // one wire, one pane of glass, one modern hem anywhere in the frame and
        // the headphones stop being an intrusion and become part of a costume
        // drama. Hence the exclusion list at the end of both Company clauses,
        // and hence Wardrobe, which takes the persona table's jacket and
        // trousers out of the prompt rather than leaving them to argue with a
        // tunic.
        //
        // The two pictures are deliberately opposite REACTIONS to the same
        // impossible object. Elias is met with bewilderment; Jubilee is met with
        // delight. Same century, same headphones: what tells the two stations
        // apart is what the crowd's faces are doing, which is also the only
        // thing that distinguishes a declaration from a celebration.

        // HM 314.88 Yes and Amen — Elias in the first century, and nobody around
        // him can account for what he is wearing.
        //
        // The station is the SingItDone declaration property: twelve voices
        // singing who they already are before Yahuah. This picture puts that
        // declaration where the words were first true, and lets the village
        // watch a man hear something they cannot.
        //
        // THE SUNSET IS NOT DECORATION. LightFor hashes off the slug and this
        // slug draws "sunset gold flooding in from behind the skyline", with a
        // camera axis that is backlit and flared with the sun at the frame's
        // corner. A Bespoke entry overrides the scene and the pose but NOT the
        // light, so the scene must be written to agree with the light it drew.
        // The previous entry set this station inside a church and had to argue a
        // skyline into a building; an open village street at sunset simply is
        // what that light already describes.
        //
        // The onlookers are PUZZLED, not hostile. Confusion is the honest
        // reaction to something inexplicable and it keeps the picture warm;
        // anger or fear would turn a station card into a scene of persecution
        // and put the wrong feeling on the dial.
        ["yes-and-amen"] = new(
            "a first-century Galilean village street at sunset — low houses of rough limestone and mud brick " +
            "with flat clay roofs, an open market of woven baskets, clay jars, figs and olives set out on " +
            "cloths, a laden donkey standing in the street, dusty stone underfoot and the bare hills beyond " +
            "the rooftops with the sun going down behind them",
            "caught mid-stride with {P} eyes closed and {P} head tipped back, mouth open on the middle of a " +
            "sung line and one hand lifted open at {P} side, the coarse cloth of {P} robe and the cloak over " +
            "{P} shoulder swinging with the step, entirely lost in something nobody else can hear",
            "{SU} IS WALKING THROUGH A VILLAGE THAT HAS STOPPED TO LOOK, AND THE VILLAGERS ARE PART OF THE " +
            "PICTURE, AND THEY ARE BAFFLED: first-century men and " +
            "women stopped in the middle of what they were doing to look at {O} — a woman with a water jar " +
            "still on her shoulder, a trader half risen from his cloth of goods, two men turned to each other " +
            "mid-question, a boy pointing openly at {P} head. Their faces are puzzled and searching, brows " +
            "drawn, some tilting their heads to listen for whatever {S} is hearing and finding nothing. Not " +
            "angry and not afraid — simply unable to account for {O}. They stand near enough to read as one " +
            "village looking at one man, and the street carries on past both edges of the frame. " +
            "{SU} IS THE ONLY ONE WEARING HEADPHONES, and the headphones are THE ONLY MODERN OBJECT IN THE " +
            "PICTURE: no cable runs from them and there is nothing anywhere in the frame for them to be " +
            "plugged into. EVERYTHING ELSE IS OF THE FIRST CENTURY — every garment homespun wool and linen, " +
            "every tool and vessel wood, clay, leather or bronze, every surface stone, mud brick or timber. " +
            "No glass, no metal railings, no wires, no printing, no machinery, no vehicles, no electric light " +
            "and no modern clothing on anyone.",
            "a single figure, Elias, in the middle of a first-century village street and filling the frame",
            Wardrobe:
                "a first-century labourer's clothing — a long undyed homespun tunic to mid-calf with sleeves " +
                "to the wrist, a coarse woven cloak over one shoulder, a folded cloth belt at the waist and " +
                "worn leather sandals, all of it dusty from the road. Nothing he wears is modern"),

        // HM 313.12 Celebrate Yeshua! — Jubilee in the first century, and the
        // village is delighted with her.
        //
        // The mirror of Yes and Amen, and written directly beneath it so the two
        // are edited as the pair they are. Same world, same impossible white
        // headphones, opposite crowd: they are clapping her on rather than
        // puzzling over her, because this station is a celebration and the faces
        // are what say so. The scene rotation had it in a car-wash bay, which is
        // a perfectly good picture for a pop station and says nothing whatever
        // about celebrating Yeshua.
        //
        // WRITTEN TO THE LIGHT AND THE LENS THIS SLUG DREW, as above: "deep
        // amber light pouring in from one side", and a camera "shot from just off
        // to one side with the backdrop running away in deep perspective". So the
        // scene is a stepped street that runs away behind her and takes the amber
        // down one wall of it.
        //
        // HER WHITE SURVIVES THE CENTURY. Jubilee is white head to foot on every
        // card on the dial. The Wardrobe override changes what the white garments
        // ARE without touching the rule or the modesty that goes with it — linen
        // tunic and mantle instead of dress and shoes, still white, still closed
        // at the neck, still covering her arms, still to the floor.
        ["jubilee-ccm"] = new(
            "a first-century village street running away into deep perspective — a stepped lane of pale " +
            "limestone between low flat-roofed houses, woven awnings and hanging cloths strung overhead, " +
            "clay water jars and baskets of figs and pomegranates along the walls, date palms rising behind " +
            "the rooftops and the late sun coming hard down one side of the street",
            "caught in full voice mid-song with {P} head lifted and {P} eyes half closed, mouth open on a " +
            "held note, both hands raised open at shoulder height, weight rocking onto one foot and the " +
            "linen of {P} robe and the mantle over {P} shoulders lifting with the movement",
            "{SU} IS SINGING IN THE MIDDLE OF A VILLAGE GATHERING AND THE GATHERING IS PART OF THE PICTURE, " +
            "AND THEY ARE DELIGHTED: first-century men, " +
            "women and children close around {O}, smiling broadly and clapping in time, faces lit and turned " +
            "toward {O} — an older woman laughing with both hands up, two girls dancing at {P} side, a man " +
            "beating time against a clay jar, children pressing in at the front. They are plainly enjoying " +
            "the singing and joining in with it. They stand near enough to read as one gathering caught up in " +
            "one song rather than a few figures placed behind {O}, and the crowd carries on past both edges " +
            "of the frame. " +
            "{SU} IS THE ONLY ONE WEARING HEADPHONES, and the headphones are THE ONLY MODERN OBJECT IN THE " +
            "PICTURE: no cable runs from them and there is nothing anywhere in the frame for them to be " +
            "plugged into. EVERYTHING ELSE IS OF THE FIRST CENTURY — every garment homespun wool and linen, " +
            "every tool and vessel wood, clay, leather or bronze, every surface stone, mud brick or timber. " +
            "No glass, no metal railings, no wires, no printing, no machinery, no vehicles, no electric light " +
            "and no modern clothing on anyone.",
            "a single figure, Jubilee, in the middle of a first-century village gathering and filling the frame",
            Wardrobe:
                "first-century clothing in white only — a floor length white linen tunic with sleeves to the " +
                "wrist and a high neck closed at the collarbone, a white linen mantle over her shoulders and " +
                "head, a white woven sash at the waist and pale leather sandals. White from head to foot and " +
                "no other colour anywhere on her, and nothing she wears is modern"),
    };

    private static Bespoke? BespokeFor(Station s) =>
        BespokeStations.TryGetValue(s.Slug, out var b) ? b : null;

    private static string SceneFor(Station s)
    {
        var bespoke = BespokeFor(s);
        if (bespoke is not null) return bespoke.Scene;

        if (s.Region.Length > 0 && s.Region != "domestic")
        {
            // BY LANGUAGE. The station speaks it, so the picture stands where it
            // is spoken. See ScenePoolKey.
            var byLanguage = s.Lang switch
            {
                "Spanish" => new[]
                {
                    "a steep street of painted houses in Valparaíso, laundry strung overhead and a funicular climbing the hill behind",
                    "a Mexico City market street heaped with marigolds, a trumpet case open on the kerb",
                    "a Buenos Aires plaza where tango dancers have chalked their circle onto the paving",
                    "a Seville courtyard of orange trees with a guitar and heel-stamping spilling out of a doorway",
                },
                "Portuguese" => new[]
                {
                    "a Rio beachfront promenade at golden hour, volleyball nets up, coconut carts and runners going by",
                    "a Lisbon tram stop on a steep hill, a yellow tram rattling past tiled facades",
                    "a São Paulo rooftop gathering spilling onto the fire escape, the city stacked up behind",
                    "a Salvador da Bahia street as a drum procession comes round the corner",
                },
                "Mandarin" => new[]
                {
                    "a Shanghai riverside promenade, tai chi in the foreground and ferries crossing behind",
                    "a Hong Kong wet market under bright awnings, baskets stacked to the roof",
                    "a Taipei night market, scooters parked in ranks and light spilling from every stall",
                    "a Chengdu teahouse courtyard under old trees, bamboo chairs and steam off the cups",
                },
                "Korean" => new[]
                {
                    "a Seoul night-market alley, steam rolling off the griddles under paper lanterns",
                    "a Busan hillside village of painted houses with the harbour far below",
                    "a Han river park at sunset, bike hire racks and picnic mats spread across the grass",
                    "a Bukchon hanok lane of tiled roofs with the city glittering at the end of it",
                },
                "Japanese" => new[]
                {
                    "a Tokyo crossing on a golden evening, umbrellas up and a bicycle courier threading through",
                    "a Kyoto temple lane in autumn with the maple leaves coming down",
                    "an Osaka canal-side food street as the stalls fire up",
                    "a small-town station platform under cherry blossom, petals going along the rails",
                },
                "Tagalog" => new[]
                {
                    "a Manila jeepney stop, chrome jeepneys idling and vendors calling along the line",
                    "a basketball court squeezed between houses, a game running and washing overhead",
                    "a Palawan beach where the outrigger boats are being pushed out",
                    "a Filipino public market at dawn, baskets going up onto shoulders",
                },
                "Vietnamese" => new[]
                {
                    "a Hanoi street corner at dawn, pho steam rising as the scooters flood past",
                    "a Hoi An lane strung end to end with silk lanterns",
                    "a Mekong floating market, boats nosed together and produce passing hand to hand",
                    "a Saigon junction at rush hour, a river of scooters and one traffic officer in it",
                },
                "Indonesian" => new[]
                {
                    "a Jakarta rooftop between apartment blocks with kites flying at sunset",
                    "a fishing village pier in Indonesia, nets hauled in and gulls wheeling overhead",
                    "a Yogyakarta street of becak drivers waiting under the trees",
                    "a Balinese rice terrace path with water running down the levels",
                },
                "Hindi" => new[]
                {
                    "a Jaipur bazaar at golden hour, bolts of fabric stacked to the ceiling and a cycle rickshaw threading through",
                    "a Mumbai local-train platform, chai in glass tumblers as a train pulls in",
                    "the wide stone steps of a Varanasi ghat, boats and bathers and marigolds on the water",
                    "a Delhi rooftop in kite season, string spools everywhere and the sky full of them",
                },
                "Bengali" => new[]
                {
                    "a Kolkata tram stop in monsoon light, yellow taxis and a hundred umbrellas",
                    "a Dhaka river ghat, boats crowded gunwale to gunwale and porters crossing the planks",
                    "a Kolkata sweet-shop street, trays coming out and the queue spilling onto the pavement",
                    "a Sundarbans jetty where a ferry is loading in the last of the light",
                },
                "Arabic" => new[]
                {
                    "a Cairo souk lit by hanging brass lamps, spices heaped in cones",
                    "a Beirut corniche at sunset, fishermen's lines out over the rail",
                    "a stone stair street in Amman between old houses, cats and geraniums on every step",
                    "a Marrakech square as the food stalls light up and the smoke rises",
                    "a Dubai creek crossing, wooden abras loading and gold light on the water",
                },
                "French" => new[]
                {
                    "a Paris bridge in the late afternoon, booksellers' stalls open along the parapet",
                    "the old port of Marseille, fish crates on the quay and masts crowding behind",
                    "a Lyon covered passage, glass roof overhead and a bakery door standing open",
                    "a Dakar street market in the golden late afternoon, fabric and fruit stacked high",
                },
                "Romanian" => new[]
                {
                    "a Bucharest boulevard after rain, puddles catching the light under the chestnut trees",
                    "a Transylvanian village lane with haystacks in the fields and a horse cart coming up it",
                    "the old-town square in Cluj, cafe tables out and swifts going over",
                    "a Danube fishing village where the nets are spread along the bank",
                },
                "German" => new[]
                {
                    "a Berlin courtyard of painted walls with a bicycle repair stand out front",
                    "an alpine village lane, geraniums in the window boxes and cowbells on the slope above",
                    "the Hamburg harbour walkway, cranes working and a barge sliding past",
                    "a Bavarian market square on market day, awnings and crates and church bells",
                },
                "Russian" => new[]
                {
                    "a Moscow metro escalator hall, warm lamplight running down the marble",
                    "a St Petersburg canal embankment in low sun, ironwork railings and a bridge beyond",
                    "a street of wooden houses in low Siberian sun, smoke going straight up",
                    "a Moscow tram stop in autumn, leaves banked against the rails",
                },
                "Italian" => new[]
                {
                    "a Venetian canal side, a delivery boat nosing in under washing strung between the windows",
                    "a Naples backstreet where a football game has taken over the whole alley",
                    "a Roman piazza at golden hour, a fountain running and scooters cutting across",
                    "a Tuscan hill-town lane with the valley dropping away at the end of it",
                },
                "Polish" => new[]
                {
                    "a Kraków market square as the pigeons all lift at once",
                    "the Gdańsk waterfront, old cranes and a crowd along the quay",
                    "a Warsaw tram stop with the trams coming through one after another",
                    "a Polish orchard at harvest, crates filling and ladders in the trees",
                },
                "Swahili" => new[]
                {
                    "a Nairobi matatu stage, hand-painted buses and hawkers weaving down the line",
                    "a Zanzibar stone-town alley of carved doors with a dhow sail beyond the arch",
                    "a Mombasa fish market on the sand, boats in and the catch going out in baskets",
                    "a village football pitch at dusk with the whole neighbourhood along the touchline",
                },
                "Yoruba" => new[]
                {
                    "a Lagos market street, wax-print fabric stacked high and horns going",
                    "a Lagos bus park, danfos loading and conductors calling the routes",
                    "an Ibadan rooftop at golden hour with rusted roofs running to the horizon",
                    "a compound courtyard where the talking drums have started up",
                },
                "Amharic" => new[]
                {
                    "an Addis Ababa coffee ceremony spilling onto the pavement, incense smoke drifting",
                    "a rock-hewn church path at Lalibela in the low afternoon light",
                    "an Addis minibus stop, hands out and everyone talking at once",
                    "a highland market at golden hour, grain in sacks and mules waiting",
                },
                _ => Array.Empty<string>(),
            };
            if (byLanguage.Length > 0) return Scene(byLanguage, s);

            // A language with no pool of its own. Its region is still a better
            // answer than the domestic default.
            var regional = s.Region switch
            {
                "americas" => new[]
                {
                    "a Caribbean harbour front, fishing boats unloading and bicycles weaving between the crates",
                    "a Latin American plaza at golden hour with a brass band setting up",
                    "a hillside neighbourhood of painted houses with steps running down through it",
                },
                "europe" => new[]
                {
                    "a cobbled European square with cafe tables out and swifts going over",
                    "an Amsterdam bike bridge at the evening rush, a river of bicycles",
                    "a riverside promenade in an old European city, bridges strung away behind",
                },
                "asia" => new[]
                {
                    "a wide public square in an East Asian city, glass towers catching the last light",
                    "a park walkway under blossom trees with people passing through",
                    "a harbour front in an Asian port, ferries loading and gulls overhead",
                },
                "south" => new[]
                {
                    "a bustling South Asian street corner, colour everywhere and shopfronts wide open",
                    "a public park in a South Asian city in the golden late afternoon",
                    "a railway platform where the tea sellers are working the carriages",
                },
                "middle" => new[]
                {
                    "a stone courtyard square with arched doorways and warm light",
                    "a palm-lined promenade late in the day",
                    "a covered market of lamps and spices at golden hour",
                },
                "africa" => new[]
                {
                    "a sunlit open square in an African town, market stalls beyond",
                    "a wide city street in the golden late afternoon, colour everywhere",
                    "a beach at sunset where the fishing boats are being hauled up the sand",
                },
                _ => new[] { "a busy public square with its own life running through it" },
            };
            return Scene(regional, s);
        }

        var pool = s.Primary switch
        {
            "music" => new[]
            {
                "a subway platform where a busker has an amp set up and a train is blurring past",
                "a rooftop basketball court at golden hour, chain nets and a game running",
                "a car-wash bay with foam everywhere and the doors rolled up",
                "a skate-park bowl in the late light, dust hanging where the wheels have been",
                "the open bed of a pickup truck pulled up on a dirt road at sunset",
                "a laundromat glowing at dusk, every dryer turning",
                "a record-shop doorway on a busy street, crates of vinyl out on the pavement",
                "a pier boardwalk with the Ferris wheel turning behind",
                "moving day on a city kerb, the truck's back open and a sofa half out",
                "a community garden at watering time, hoses arcing in the sun",
                "a marching band's parking lot before the game, brass catching the last light",
                "a rooftop washing-line district, sheets snapping in the wind",
            },
            "devotionals" => new[]
            {
                "a lakeside dock at sunrise with the mist still lifting off the water",
                "a kitchen doorway thrown open to a garden at first light",
                "a hilltop path at dawn where a runner has stopped to look out",
                "a milking parlour at first light, steam and warm lamps",
                "a fire-escape landing above a street just waking up",
            },
            "bible_studies" => new[]
            {
                "the library steps of a university at golden hour, students streaming down them",
                "a second-hand bookshop of ladders and stacked spines",
                "a train carriage at golden hour with fields flashing past the window",
                "a lighthouse walkway with the sea working below",
                "a woodworking shop with sawdust hanging in the shafts of light",
                "a campus quad in autumn, leaves being kicked up along the path",
                "a mountain trail switchback where the valley suddenly opens below",
                "a corner diner at sunrise, coffee going round the counter",
                "a fishing dock at first light with nets being mended along the boards",
                "a rooftop greenhouse, condensation on the glass and tomato vines climbing",
                "a bus depot bench at golden hour as the buses pull out one by one",
                "a bakery's back door at dawn with flour still in the air",
                "an old bicycle repair shop, wheels hung in rows on the wall",
                "a ferry deck crossing at sunset, gulls tracking the wake",
            },
            "online_church" => new[]
            {
                "a church car park where folding chairs are going in along a chain of hands",
                "a riverside gathering at golden hour, towels over shoulders and singing carrying",
                "a hospital courtyard where the staff are out on their break",
                "a firehouse apron with the doors up and the engine gleaming",
                "a nursing-home garden on trimming day, clippings all over the path",
                "a food-bank loading bay with crates moving hand to hand",
                "a school gym laid out with round tables for a community supper",
                "a barn raising in an open field, timber going up against the sky",
                "a shelter kitchen at service time, steam rolling and trays stacking",
                "a stadium concourse emptying out after the final whistle",
                "a village hall doorway on a bright morning, the tea urn steaming outside",
                "a construction site canteen at golden hour, hard hats along the bench",
            },
            "prayer" => new[]
            {
                "a cathedral side aisle where a rack of candles is being lit",
                "a hospital chapel corridor with light coming through amber glass",
                "a walled garden with a stone bench and bees working the lavender",
                "a fishing harbour wall at dawn, the boats coming back in",
                "a cloister walk in low sun, the arches throwing long bars of light",
            },
            "children" => new[]
            {
                "a splash-pad plaza on a hot afternoon with water arcing everywhere",
                "a carousel at golden hour, the horses turning",
                "a kite field on a windy afternoon, a dozen kites up at once",
                "a pumpkin patch with the tractor wagon coming round",
                "a sports-day finish line strung with bunting, families cheering along the rope",
            },
            "sleep_rest" => new[]
            {
                "a porch swing at dusk with fireflies out and one warm lamp burning",
                "a caravan awning at a lakeside campsite, lanterns just lit",
                "a hammock strung between olive trees in the last of the light",
                "a sleeper-train corridor at night, warm reading lamps down its length",
                "a rooftop under strings of bulbs after sunset",
            },
            "talk_podcasts" => new[]
            {
                "a barbershop at golden hour, clippers going and the talk never stopping",
                "a taxi rank where the drivers are leaning on their bonnets",
                "a newsstand corner at the morning rush",
                "a bike repair co-op with wheels being trued on the stand",
            },
            "hebrew_roots" => new[]
            {
                "a courtyard table laid for a festival meal under a canopy of vine leaves",
                "a bakery as the braided loaves come out of the oven",
                "an olive grove at harvest, nets spread wide under the trees",
                "a hillside vineyard at sunset with crates being carried down the rows",
                "a market stall of spices and cedar boxes at golden hour",
            },
            "radio_theater" => new[]
            {
                "the wings of an old theatre, ropes and dust turning in the light",
                "an outdoor amphitheatre at dusk as the lights come up",
                "a puppet workshop with marionettes hanging from the beams",
                "a drive-in lot at last light, tailgates down and the screen going white",
            },
            _ => new[]
            {
                "a rooftop pool deck in the late afternoon",
                "an airport moving walkway at golden hour",
                "a farmers' market at closing time, awnings coming down",
                "a busy junction where the bike couriers wait for the lights",
                "a climbing gym with chalk dust turning in the beams",
                "a drive-in lot before dark, tailgates open and radios on",
                "a print workshop with the presses running",
                "the roof terrace of a co-working building at golden hour",
                "an escalator hall with sun coming through the glass roof",
                "a coastal boardwalk in a stiff breeze",
                "a florist's shop front with buckets of stems out on the pavement",
                "a rowing club dock at sunrise as the boats go out",
                "a night bus stop lit amber with the city behind it",
                "a boxing gym at golden hour, ropes and heavy bags swinging",
                "a ski-lift base station in the last of the light",
                "a stable yard at feeding time",
                "a pottery studio with every wheel turning",
                "a hardware store aisle where keys are being cut",
                "a rooftop solar install, cables and tools spread across the tiles",
                "a food-truck lot at golden hour with the queues forming",
            },
        };
        return Scene(pool, s);
    }

    /// <summary>
    /// THE GOLDEN GLOW. Every image on this dial is warm.
    ///
    /// Not a style note — the house look, and the one the JubiLujah covers are
    /// already lit by. The variants differ in where the warm light comes from so
    /// a hundred images are not one lighting setup repeated, but every one of
    /// them lands on the same golden-yellow key.
    /// </summary>
    private static string LightFor(Station s)
    {
        var pool = new[]
        {
            "low golden-hour sun raking across the frame, warm yellow light on {P} skin and hair, long amber shadows and dust glowing in the beams",
            "the sun low and directly behind {O}, blazing golden through {P} hair, rim-lighting every edge in warm yellow and flaring softly into the lens",
            "deep amber light pouring in from one side, honey-coloured highlights down {P} face and rich warm shadow behind, everything gilded",
            "warm yellow lamplight and the last of the sun toget{O}, glowing pools of gold against a deepening blue hour",
            "hot golden afternoon light bouncing up off the ground into {P} face, warm reflected glow filling every shadow",
            "a shaft of golden light breaking through overhead and falling straight onto {O}, warm yellow beams full of floating dust and haze",
            "strings of warm yellow light behind {O} mixing with low sun into a golden wash across the whole image",
            "sunset gold flooding in from behind the skyline, warm haze softening the far edges into amber",
        };
        return Pick(pool, s, 4);
    }

    /// <summary>How it is shot. On a single-figure cover the lens choice is most of the drama.</summary>
    private static string CameraFor(Station s)
    {
        var pool = new[]
        {
            "shot on an 85mm wide open, {P} face and the headphones critically sharp and the whole backdrop dissolved into golden bokeh",
            "shot slightly from below so {S} stands tall against the sky, wide lens, the backdrop sweeping away behind {O}",
            "a 50mm at eye level, close enough that {P} shoulders break the edges of the frame",
            "shot from just off to one side with the backdrop running away in deep perspective behind {O}",
            "backlit and slightly flared, {P} outline edged in gold, the lens catching the sun at the frame's corner",
            "a long lens from a distance, the backdrop compressed and stacked up behind {O} into layers of warm haze",
            "a low wide angle tilted a few degrees, the movement running diagonally across the frame",
            "shot tight from the waist up, the backdrop reduced to soft blocks of golden colour behind {O}",
        };
        return Pick(pool, s, 5);
    }

    // ---- the twelve, as people ----------------------------------------------
    //
    // SIX OF THE TWELVE ARE MEN, which the first single-subject draft managed to
    // forget: it said "she" and "her gown" in nine places and would have put
    // Elias in a floor-length dress. Pronouns are therefore tokens, filled at the
    // end of composition, and every pool below is written with them.
    //
    //   {S} she / he      {P} her / his      {O} her / him
    //
    // The wardrobe is not invented here either. InspireManna's personas/README.md
    // carries a canonical wardrobe table for all twelve across four registers,
    // and what follows is its "Gathering" column — the dressiest of the four,
    // which is the right register for cover artwork. Every entry in it is already
    // modest: high necks, sleeves to the wrist, hems to the ankle. That is the
    // house standard for all twelve and not a rule invented for one of them.

    private static bool IsFemale(string firstName) => firstName switch
    {
        "Jubilee" or "Melody" or "Nova" or "Eliana" or "Zariah" or "Imani" => true,
        _ => false,
    };

    /// <summary>Fill the pronoun tokens for one persona.</summary>
    private static string Fill(string text, string firstName)
    {
        var f = IsFemale(firstName);
        return text
            .Replace("{S}", f ? "she" : "he")
            .Replace("{P}", f ? "her" : "his")
            .Replace("{O}", f ? "her" : "him")
            .Replace("{SU}", f ? "SHE" : "HE");
    }

    /// <summary>
    /// What the persona is wearing, from the canonical table. Modest by house
    /// standard for every one of the twelve, and distinctive enough that a
    /// listener who knows the family recognises the station's host before they
    /// read the name.
    /// </summary>
    private static string WardrobeFor(string firstName) => firstName switch
    {
        "Jubilee" => "a floor length white dress with long sleeves and a high neck, a white wrap, and white shoes — " +
                     "white from head to foot and no other colour anywhere on her",
        "Melody" => "a charcoal midi dress with elbow length sleeves and a high neckline, under a light grey shawl",
        "Nova" => "a midnight blue long sleeved midi dress with a high neckline, and flat shoes",
        "Eliana" => "a deep burgundy floor length dress with long sleeves and a high neck, under a woven shawl",
        "Zariah" => "a floor length teal dress with long sleeves and a high neck, with a light head scarf",
        "Imani" => "a full length gold and emerald wax print dress with long sleeves and a high neck, with a matching head wrap",
        "Amir" => "a deep blue kurta with fine cream embroidery, dark trousers, and leather sandals",
        "Caleb" => "a charcoal jacket over a buttoned white shirt, with dark trousers",
        "Elias" => "a dark jacket over a buttoned white shirt, with dark trousers and no tie",
        "Santiago" => "a cream guayabera with fine pleating, dark trousers, and polished leather shoes",
        "Tahoma" => "a dark ribbon shirt with muted woven bands across the shoulders, and dark trousers",
        "Zev" => "his embroidered kippah, a white shirt under a dark jacket, a tallit across the shoulders, and dark trousers",
        _ => "modest, well made clothing with a high neckline and long sleeves",
    };

    /// <summary>
    /// How the persona is standing, moving or turning. ALBUM-COVER POSING.
    ///
    /// One figure, filling the frame, caught in a moment rather than posed for a
    /// portrait — which is what the JubiLujah covers do and what three rewrites
    /// of a documentary scene could not reach. Hair and fabric are always doing
    /// something: a still figure in still clothing is the mannequin that came
    /// back last time.
    ///
    /// Written with pronoun tokens and NO named garment, because the garment is
    /// WardrobeFor's job and naming one here would contradict it.
    /// </summary>
    private static string PoseFor(Station s)
    {
        var bespoke = BespokeFor(s);
        if (bespoke is not null) return bespoke.Pose;

        var pool = s.Primary switch
        {
            "sleep_rest" or "prayer" or "devotionals" => new[]
            {
                "caught mid-turn with {P} eyes closed and {P} face tipped up into the light, hair lifting off {P} shoulders",
                "walking slowly toward the camera, {P} gaze off to one side, the fabric trailing behind {O}",
                "standing still with {P} head tipped back and a slow smile beginning, hair moving in the air around {O}",
                "half turned away and looking back over {P} shoulder into the light, hair swept across by the movement",
                "with one hand lifted just clear of {P} side, palm open, chin raised, entirely absorbed in what {S} is hearing",
            },
            _ => new[]
            {
                "caught mid-turn, hair flying out wide, sleeves and hem swinging with the movement",
                "striding toward the camera with {P} chin up and {P} hair streaming back, fabric snapping behind {O}",
                "laughing outright with {P} head thrown back, hair thrown with it, both hands lifted",
                "spinning, the cloth flaring out in a wide arc, hair lifted all around {P} face",
                "leaning into the wind with hair and cloth pulled hard to one side, eyes bright and fixed ahead",
                "arms flung wide and face lifted, caught at the very top of the movement",
                "half turned, one hand raised to the headphones, the other arm out for balance, hair still swinging",
                "walking fast and glancing back over {P} shoulder, everything about {O} still in motion",
                "head down and eyes closed into the beat, hair falling forward, {P} shoulders in it",
                "reaching out toward the light with one arm, the whole figure stretched into the reach",
            },
        };
        return Pick(pool, s, 2);
    }

    /// <summary>
    /// Compose the whole prompt for one station.
    ///
    /// ONE SUBJECT. This is the third approach and the first one that is not a
    /// crowd. The first put white headphones on everybody in a public place and
    /// rendered as a flash mob; the second cut it to one-to-four wearers inside a
    /// busy scene and rendered as reportage — figures small in the frame, faces
    /// indistinct, nothing anyone would click on. A station card is closer to an
    /// album cover than to a news photograph, and the JubiLujah covers already
    /// ARE that, so the picture is now what they are: the station's own persona,
    /// alone, filling the frame, wearing white headphones.
    ///
    /// The scene tables survive that change and are better for it. What was a
    /// documentary location is now a cinematic BACKDROP — the ruined skyline
    /// behind Nova on Aftershocks, the cloudscape behind Jubilee on Sky Splits
    /// Open — so a hundred and two stations still each get their own world.
    ///
    /// ONE LINE and no newlines anywhere. See AspectSuffix: the composer treats a
    /// blank line as a paragraph break and sends only the last paragraph, so a
    /// multi-line prompt arrives truncated to its tail.
    /// </summary>
    private static string StationPrompt(Station s, string firstName)
    {
        var bespoke = BespokeFor(s);
        var who = bespoke?.Who ?? (firstName.Length > 0 ? firstName : "one person");
        var language = s.Lang.Length > 0 && !s.Lang.Equals("English", StringComparison.OrdinalIgnoreCase)
            ? $" The setting belongs to the world where {s.Lang} is spoken, though no words or writing appear anywhere in the picture."
            : "";

        var prompt =
            "Album cover artwork: " +
            (bespoke?.Subject ?? ("a single figure, " + who + ", alone and filling the frame")) +
            ", shot from the waist up to three-quarter length and placed off-centre against a wide " +
            "cinematic backdrop. " +
            "The backdrop is " + SceneFor(s) + " — rendered deep, atmospheric and slightly soft, the way a film poster " +
            "carries its world behind the subject. " +
            who + " is wearing WHITE over-ear headphones — clean matte white, plain and modern, with no branding, " +
            "lettering, numbers or logos on them of any kind, worn over the ears and clearly visible. " +
            who + " is " + PoseFor(s) + ". " +
            // Most stations want the host alone. A bespoke station may need company
            // in frame — a choir around Imani, angels either side of Zev — and for
            // those the solo rule is replaced rather than merely softened, because
            // a contradicting sentence left in place is a sentence the model gets
            // to choose between.
            (bespoke?.Company
             ?? "{SU} IS THE ONLY PERSON IN THE PICTURE. Any other figure is far away, small, blurred and unlit; nobody " +
                "else is anywhere near {O} and nobody else wears headphones.") +
            language +
            " THE WHOLE IMAGE IS BATHED IN A GOLDEN GLOW: " + LightFor(s) + ", a rich warm yellow colour grade throughout, " +
            "light catching every strand of hair and every fold of fabric. " +
            "Luminous, cinematic, painterly photorealism, extremely richly detailed, beautiful, striking, " +
            "the finish of a high-end album cover. " + CameraFor(s) + ". " +
            "No text, no captions, no lettering, no signature, no title, no border or frame, no logos and no watermark " +
            "anywhere in the image. 16:9";

        return Regex.Replace(Fill(prompt, firstName), @"\s+", " ").Trim();
    }

    // ---- the host in the picture --------------------------------------------
    //
    // Two things put the station's persona in its image, and both are needed:
    //
    //   1. The portrait at personas/persona_<Name>.png is ATTACHED to the ChatGPT
    //      turn. Description alone cannot hold a consistent face across a hundred
    //      images in twelve voices; a reference photo can.
    //   2. HostClause tells the model what to take from that photo and, just as
    //      importantly, what to throw away.

    /// <summary>
    /// The portrait file for a persona slug, or null if it is not on disk.
    ///
    /// The canonical name is persona_&lt;Name&gt;.png with the first letter
    /// capitalised, which is how the twelve are stored. The directory sweep
    /// afterwards is not belt-and-braces: this repo lives on a mapped network
    /// share whose casing is not guaranteed to survive a copy, and a
    /// case-mismatched filename would otherwise silently cost every station that
    /// voice hosts.
    /// </summary>
    private string? ReferencePathFor(string hostSlug)
    {
        if (hostSlug.Length == 0 || !Directory.Exists(_personasRoot)) return null;
        var name = FamilyNameFor(hostSlug);
        if (name.Length == 0) return null;

        var exact = Path.Combine(_personasRoot, $"persona_{name}.png");
        if (File.Exists(exact)) return exact;

        foreach (var ext in new[] { ".png", ".jpg", ".jpeg", ".webp" })
        {
            var wanted = $"persona_{name}{ext}";
            foreach (var f in Directory.EnumerateFiles(_personasRoot, "persona_*" + ext))
                if (string.Equals(Path.GetFileName(f), wanted, StringComparison.OrdinalIgnoreCase)) return f;
        }
        return null;
    }

    /// <summary>
    /// A portrait as a base64 JPEG, small enough to hand to the page in one
    /// injected script.
    ///
    /// The originals are 1920x1080 PNGs of about 2.4 MB each. Injecting one of
    /// those as base64 means a 3.2 MB JavaScript string literal per turn, for no
    /// gain: the reference only has to carry a face. Cropped and downscaled to
    /// 768x768 at JPEG 88 the twelve measure 139 to 217 KB of base64, which is a
    /// script string the page swallows without complaint. Cached, because a sweep
    /// of the dial sends the same twelve portraits eight or nine times each.
    ///
    /// The centre-square crop comes first, and it is worth more than it looks.
    /// The portraits are 16:9 with the subject centred and the head inside the
    /// middle third, so a straight 16:9 downscale spends most of its pixels on
    /// empty neon background and leaves the face about 250px tall. Cropping to
    /// the centred square before the resize throws away only background and
    /// leaves the face nearer 450px — the same bytes, most of them now spent on
    /// the only part of the picture that is being referenced.
    ///
    /// Landscape sources only. A portrait-orientation replacement would have the
    /// head near the top, where a vertically centred square crop would cut it off.
    /// </summary>
    private string? ReferenceBase64(string path)
    {
        if (_referenceCache.TryGetValue(path, out var hit)) return hit;
        try
        {
            using var image = SixLabors.ImageSharp.Image.Load(File.ReadAllBytes(path));
            if (image.Width > image.Height)
            {
                var side = image.Height;
                var left = (image.Width - side) / 2;
                image.Mutate(x => x.Crop(new SixLabors.ImageSharp.Rectangle(left, 0, side, side)));
            }
            image.Mutate(x => x.Resize(new SixLabors.ImageSharp.Processing.ResizeOptions
            {
                Mode = SixLabors.ImageSharp.Processing.ResizeMode.Max,
                Size = new SixLabors.ImageSharp.Size(ReferenceMaxEdge, ReferenceMaxEdge),
            }));
            using var ms = new MemoryStream();
            image.Save(ms, new SixLabors.ImageSharp.Formats.Jpeg.JpegEncoder { Quality = 88 });
            var b64 = Convert.ToBase64String(ms.ToArray());
            _referenceCache[path] = b64;
            return b64;
        }
        catch (Exception ex)
        {
            Log($"  ⚠ Could not read the host portrait {Path.GetFileName(path)}: {ex.Message}");
            return null;
        }
    }

    private const int ReferenceMaxEdge = 768;

    /// <summary>
    /// What the model should do with the attached portrait.
    ///
    /// ONE LINE. See AspectSuffix for why a newline here silently truncates the
    /// whole prompt.
    ///
    /// The discard list is the load-bearing half. The reference portraits are
    /// stylised studio pieces: neon-lit hexagon costume, glowing trim, circuit
    /// background, head-and-shoulders crop, subject staring down the lens. Attach
    /// one without saying what to ignore and the host walks into a family kitchen
    /// or a bus seat dressed in glowing armour, which wrecks the picture and,
    /// worse, wrecks the point — a kJubilee station image has to look like the
    /// listener's own life. So the clause takes the FACE and nothing else, and
    /// hands the wardrobe decision back to the scene.
    ///
    /// The host is placed AMONG the listeners rather than in front of them. They
    /// are the station's voice, but the picture is about the people who tune in;
    /// a host portrait with listeners behind it would invert that. Present in the
    /// room, listening too, not the subject of the photograph.
    /// </summary>
    private static string HostClause(string firstName, bool hasStyle, string? wardrobeOverride = null)
    {
        // POSITIVE ONLY. The InspireManna original's first versions said "never
        // heavy set, stocky, plump or overweight" and asked the model to ignore
        // "any impression of age", and Jubilee still came back old and heavy on
        // three regenerations running. An image model does not subtract a concept
        // it has been shown: naming grey hair or a heavy build in order to forbid
        // it plants it. So every word below is a word we want in the picture, and
        // nothing names the reading we are steering away from.
        var body = firstName + " is " + AgePhrase(firstName) + ", tall at six feet, slender and lean, light framed and trim, " +
                   "long limbed with narrow shoulders and a slim waist, " + FacePhrase(firstName) + " ";

        // Hair. The reference sheets are lit white and Jubilee's pale hair reads
        // as grey off the sheet no matter what the words say, so for her the hair
        // colour comes from words alone and the sheet supplies the face only.
        // Everyone else keeps hair colour and texture from the sheet, which is
        // what carries Tahoma's braid, Zev's curls and Imani's wrap.
        var hair = HairOverride(firstName);
        var take = hair.Length > 0
            ? "Take from it ONLY the facial features and skin tone. " + hair + " "
            : "Take from it ONLY the facial features, skin tone, hair colour and texture, and facial hair. ";

        // Jubilee's white is HERS ALONE, and it is the one place where her
        // wardrobe and this studio's white equipment could be confused into
        // dressing the whole room in white. Stated with the exclusion, as it is
        // on InspireManna, plus the reminder that the white radio is a separate
        // matter from what anyone is wearing.
        // THE WARDROBE IS CANONICAL AND MODEST FOR ALL TWELVE, out of the table in
        // InspireManna's personas/README.md. Modesty is therefore not a rule
        // bolted on for one persona: every entry in that table already closes at
        // the neck and covers the arms, and Jubilee differs only in being white
        // throughout. Restating it here, per persona, is what keeps a spinning
        // figure in a wind from being rendered out of it.
        var wardrobe =
            "Dress " + firstName + " in " +
            (wardrobeOverride is { Length: > 0 } w ? w : WardrobeFor(firstName)) + ". " +
            "That clothing is modest and stays modest through the whole movement: the neckline stays closed at the " +
            "collarbone, the sleeves stay long and cover the arms, and the hem stays where it is described, however " +
            "much the fabric is moving. " +
            (firstName == "Jubilee"
                ? "The white is Jubilee's alone and she wears no other colour anywhere. "
                : "") +
            "The headphones stay white regardless of what is being worn. ";

        // THE TWO ATTACHMENTS DO DIFFERENT JOBS and the clause has to say which is
        // which, in order, or the model averages them: it takes the cover's face
        // or the portrait's costume, and both are wrong.
        var style = hasStyle
            ? "A SECOND image is attached. That one is an existing album cover of the same person and it is the " +
              "STYLE reference: match its look exactly — the single figure filling the frame, the scale and placement " +
              "of that figure, the deep cinematic backdrop behind her, the luminous golden light, the painterly " +
              "photorealistic finish, the richness of detail, and the cut of her wardrobe. " +
              "Take NOTHING ELSE from it: not its square shape, not its lettering, signature, title or thin white " +
              "border, and not the particular place it is set in — the setting is the one described above. " +
              "The finished picture should look as though it came from the same set of album covers as that second image. "
            : "";

        var clause =
            " The FIRST attached photograph is a likeness reference for one person only, named " + firstName + ". " +
            take +
            "Ignore everything else about that first photograph completely: its clothing, its glowing or " +
            "futuristic costume, its headwear, its jewellery, its neon and circuit-pattern background, its " +
            "studio lighting and its head-and-shoulders framing are all irrelevant and must not appear. " +
            "The age and the build of " + firstName + " are the ones stated here in words. " +
            body +
            style +
            firstName + " is the SUBJECT of this picture and the only person in it: large in the frame, the whole " +
            "composition built around {O}, lit by the scene's own golden light. {S} is not looking into the lens — " +
            "{P} attention is on what {S} is hearing, or on something beyond the edge of the frame — and {S} is caught " +
            "in the middle of a movement rather than posed for a photograph. " +
            wardrobe +
            "Do not add any name, caption, label, watermark or text anywhere in the image.";

        return Fill(clause, firstName);
    }

    /// <summary>
    /// The age of each Family member, as a positive phrase. Every one of the
    /// twelve is thirty except Elias, who is in his late fifties by design.
    /// </summary>
    private static string AgePhrase(string firstName) =>
        firstName == "Elias" ? "a man in his late fifties" : "a young adult of thirty who looks thirty";

    /// <summary>The face, stated positively, so youth is a described thing and not a bare number.</summary>
    private static string FacePhrase(string firstName) =>
        firstName == "Elias"
            ? "with a weathered, kind, deeply lined face and a full silver grey beard."
            : "with a youthful, smooth, unlined face, bright clear eyes and firm skin, the fit healthy look of an active young adult in the prime of life.";

    /// <summary>
    /// Hair stated in words for the personas whose sheet misleads. Jubilee's
    /// sheet is lit white and every render that took her hair colour from it came
    /// back grey. Empty means take the hair from the sheet.
    /// </summary>
    private static string HairOverride(string firstName) =>
        firstName == "Jubilee"
            ? "Her hair is described here and this description takes precedence over the photograph: a glossy, " +
              "youthful, bright pale blonde bob cut to the jaw, the luminous light blonde of a young Scandinavian woman, full and shining."
            : "";

    /// <summary>
    /// Attach the portrait to the composer and wait until the page has really
    /// taken it.
    ///
    /// Returns false rather than pressing on. Sending the turn with no reference
    /// attached would produce a perfectly good image of the wrong thing — a
    /// station whose host is missing — and then write the file, so the station
    /// would count as done and never be regenerated. A skipped station is
    /// recoverable; a silently host-less one that reports success is not.
    /// </summary>
    /// <summary>
    /// Attach every reference for one turn — the likeness portrait, and the album
    /// cover behind it — and wait until the page has really taken them all.
    ///
    /// SEQUENTIALLY, with a wait between, and that is not a preference. Setting a
    /// file input's <c>.files</c> REPLACES its list, so handing the page both at
    /// once through one DataTransfer would attach whichever the page read last.
    /// Attaching one, waiting for the composer to show it, then attaching the
    /// next is the path a person takes with two files and is the only one that
    /// reliably ends with two thumbnails.
    ///
    /// Returns false rather than pressing on. Sending the turn with no reference
    /// attached would produce a perfectly good image of the wrong thing — a
    /// station whose host is missing — and then write the file, so the station
    /// would count as done and never be regenerated. A skipped station is
    /// recoverable; a silently host-less one that reports success is not.
    /// </summary>
    private async Task<bool> AttachReferences(IReadOnlyList<(string B64, string FileName, string Role)> files, CancellationToken ct)
    {
        // Anything left over from the previous turn would be sent again alongside
        // these, so the model would receive three faces and pick one.
        await Wv.CoreWebView2.ExecuteScriptAsync(ClearAttachmentsScript());
        await Task.Delay(400, ct);

        for (int i = 0; i < files.Count; i++)
        {
            var (b64, fileName, role) = files[i];
            var how = Json(await Wv.CoreWebView2.ExecuteScriptAsync(AttachScript(b64, fileName)));
            if (!how.StartsWith("attached", StringComparison.Ordinal))
            {
                Log($"  ✗ Could not hand the {role} to the page (" + (how.Length > 0 ? how : "no result") + ").");
                return false;
            }
            Log($"  Attached {fileName} as the {role} ({how}).");
            if (!await WaitForAttachments(i + 1, ct)) return false;
        }
        // One last settle before the prompt goes in: the last thumbnail decoding
        // is not the last byte reaching the server.
        await Task.Delay(2500, ct);
        return true;
    }

    /// <summary>
    /// Wait until the composer is showing <paramref name="expected"/> decoded
    /// attachments.
    /// </summary>
    private async Task<bool> WaitForAttachments(int expected, CancellationToken ct)
    {

        // The file input accepts instantly; the upload behind it does not, and a
        // turn sent mid-upload arrives with no image attached at all.
        //
        // TWO consecutive ready polls, then a settle. The thumbnail appears the
        // moment the page decodes the local file, which is before the upload it
        // triggers has finished, so a single "ready" is not evidence that the turn
        // can be sent. Two polls a second apart plus a short wait is the cheapest
        // thing that reliably clears that gap without a progress signal the page
        // does not offer.
        var start = DateTime.UtcNow;
        var deadline = start.AddSeconds(60);
        int ready = 0;
        while (DateTime.UtcNow < deadline)
        {
            ct.ThrowIfCancellationRequested();
            // "ready|2" — the state and how many the composer is showing. The
            // count is what makes a second attachment verifiable: without it a
            // stale single thumbnail reads as ready and the cover never went.
            var raw = Json(await Wv.CoreWebView2.ExecuteScriptAsync(AttachmentStateScript()));
            var bar = raw.IndexOf('|');
            var state = bar < 0 ? raw : raw.Substring(0, bar);
            var count = bar < 0 ? 0 : (int.TryParse(raw.Substring(bar + 1), out var n) ? n : 0);

            if (state == "ready" && count >= expected)
            {
                if (++ready >= 2) return true;
            }
            else
            {
                ready = 0;
                // Fifteen seconds and the composer never showed the thumbnail:
                // the input took the file and dropped it on the floor.
                if (count < expected && state == "none" && DateTime.UtcNow > start.AddSeconds(15))
                {
                    Log($"  ✗ The page never showed attachment {expected}.");
                    return false;
                }
            }
            await Task.Delay(1000, ct);
        }
        Log($"  ✗ Attachment {expected} was still uploading after 60s.");
        return false;
    }

    // ---- buttons -------------------------------------------------------------
    // Locks the "generation location" to the page you're on — meant for your
    // ChatGPT Projects → Images page, so every generation conversation is created
    // inside that project. If you're inside a chat within the project, it
    // normalizes back to the project's new-chat page.
    private async void BtnUseLocation_Click(object sender, RoutedEventArgs e)
    {
        if (!_ready) return;
        // Read the LIVE address from the page. ChatGPT is a single-page app, so
        // CoreWebView2.Source lags behind client-side navigation (clicking a
        // project/chat in the sidebar) — window.location.href is always current.
        var src = Json(await Wv.CoreWebView2.ExecuteScriptAsync("window.location.href"));
        if (string.IsNullOrWhiteSpace(src)) src = Wv.CoreWebView2.Source ?? "";
        var m = Regex.Match(src, @"^(https://chatgpt\.com/g/g-p-[^/]+)/");
        if (m.Success) src = m.Groups[1].Value + "/project";
        if (!string.IsNullOrWhiteSpace(src)) { LocationUrl.Text = src; Log("Generation location set → " + src); }
    }

    /// <summary>
    /// The one action in the stations view: generate everything still pending in
    /// whatever the selected tab covers, narrowed by the two header filters.
    /// </summary>
    private async void BtnGenerate_Click(object sender, RoutedEventArgs e)
    {
        if (!EnsureReady()) return;
        var slug = SelectedSlug();
        var pending = Pending(slug);
        if (pending.Count == 0) { Log($"Nothing pending in {DisplayFor(slug)}."); return; }
        Log($"\n=== {DisplayFor(slug)}: {pending.Count} image(s) ===");
        await RunBatch(pending);
    }

    private List<Station> Pending(string slug)
    {
        IEnumerable<Station> source = slug == AllSlug
            ? _stations
            : (_byGroup.TryGetValue(slug, out var list) ? list : Enumerable.Empty<Station>());

        return source.Where(s => InScope(s) && !s.HasImage && !_completedSlugs.Contains(s.Slug)).ToList();
    }

    private void BtnStop_Click(object sender, RoutedEventArgs e)
    {
        _cts?.Cancel();
        Log("Stopping after the current image…");
    }

    private bool EnsureReady()
    {
        if (!_ready) { Log("Browser not ready yet."); return false; }
        ReadRootsFromUi();
        if (!File.Exists(CatalogFile))
        {
            Log($"Station catalog not found: {CatalogFile}");
            Log("Set the site root in Settings and press Rescan stations.");
            return false;
        }
        return true;
    }

    // ---- batch driver --------------------------------------------------------
    private async Task RunBatch(List<Station> jobs)
    {
        if (_running) { Log("Already running — Stop first."); return; }
        _running = true;
        _cts = new CancellationTokenSource();
        SetBusy(true);
        int done = 0, skipped = 0, failed = 0, inThread = 0, consecutiveFailures = 0;
        string lastGroup = "";
        try
        {
            for (int i = 0; i < jobs.Count; i++)
            {
                _cts.Token.ThrowIfCancellationRequested();
                var job = jobs[i];

                if (job.Primary != lastGroup)
                {
                    lastGroup = job.Primary;
                    Log($"\n--- {DisplayFor(job.Primary)} ---");
                }

                // Never regenerate one already done (this session or a prior run).
                if (_completedSlugs.Contains(job.Slug) || job.HasImage)
                {
                    Log($"[{i + 1}/{jobs.Count}] {job.Name} — already has an image, skipping.");
                    skipped++;
                    continue;
                }

                // Start a new conversation for the first image, and a fresh one
                // after every 10 images in the current thread.
                bool newThread = inThread == 0;
                Log($"\n[{i + 1}/{jobs.Count}] {job.Freq}  {job.Name}  ·  hosted by {FamilyNameFor(job.Host)}");
                var ok = await GenerateOne(job, newThread, _cts.Token);
                if (ok)
                {
                    done++;
                    consecutiveFailures = 0;
                    _completedSlugs.Add(job.Slug);

                    // Tick it green now, not at the end of the run. A sweep of the
                    // dial takes hours, and a worklist that only updates when the
                    // whole thing finishes tells the user nothing while it runs.
                    _sessionDone.Add(job.Slug);
                    RenderAll();
                    // Show the image that just landed. The user is watching a long
                    // run; the picture arriving is the thing worth seeing.
                    ShowPreview(job);
                    if (++inThread >= 10)
                    {
                        Log("  Reached 10 images in this conversation — the next one starts a new thread.");
                        inThread = 0;
                    }
                    if (i < jobs.Count - 1)
                    {
                        // Image generation is far heavier than a text turn, and
                        // hammering it is what earns a "Something went wrong".
                        var wait = _rng.Next(20000, 45001);
                        Log($"  Pausing {wait / 1000.0:0.0}s before the next image…");
                        await Task.Delay(wait, _cts.Token);
                    }
                }
                else
                {
                    failed++;
                    // Three failures in a row is not bad luck. It is almost always
                    // a quota or a capacity problem, and grinding through the
                    // remaining stations would just burn them all against the same
                    // wall and finish none of them.
                    if (++consecutiveFailures >= 3)
                    {
                        Log("\n  ✗ Three failures in a row — stopping the run.");
                        Log("    This is usually an image quota or a temporary ChatGPT capacity problem.");
                        Log("    Nothing was lost: every station that failed is still pending.");
                        break;
                    }
                    // Escalating, not flat. Two failures in a row means the wall is
                    // still there, and going back after the same 60s is how a run
                    // burns its third strike on a problem another minute would have
                    // cleared.
                    var cool = consecutiveFailures switch { 1 => 60000, 2 => 150000, _ => 240000 };
                    Log($"  Cooling down {cool / 1000}s after a failure before trying the next one…");
                    await Task.Delay(cool, _cts.Token);
                }
            }
        }
        catch (OperationCanceledException) { Log("Stopped."); }
        catch (Exception ex) { Log("Error: " + ex.Message); }
        finally
        {
            _running = false;
            SetBusy(false);
            ScanAll();
            Log($"\nFinished. {done} generated"
                + (failed > 0 ? $", {failed} failed" : "")
                + (skipped > 0 ? $", {skipped} skipped (already done)" : "") + ".");
            if (done > 0) Log("Nothing here is reviewed automatically — look at the images before they go near the site.");
        }
    }

    private readonly record struct Attempt(string? Src, bool PageFailed, bool PolicyRefused, bool StaleAccepted);

    /// <summary>
    /// The host to render into one station's image. <c>Reference</c> is null when
    /// the portrait could not be found or could not be read; combined with
    /// <c>Required</c>, that is what makes GenerateOne skip rather than generate
    /// an image with nobody in it.
    /// </summary>
    private readonly record struct HostRef(bool Required, string? Reference, string Base64, string FileName, string FirstName,
                                           string? StylePath, string StyleBase64, string StyleFileName);

    /// <summary>
    /// The personas whose render is verified after generation. See
    /// VerifyHostRender for why this is not all twelve. Add a first name here if
    /// another one starts coming back older or heavier than the prompt asked.
    /// </summary>
    private static readonly HashSet<string> VerifyRenderFor =
        new(StringComparer.OrdinalIgnoreCase) { "Jubilee" };

    private HostRef ResolveHost(Station job)
    {
        if (ChkIncludeHost.IsChecked != true) return new HostRef(false, null, "", "", "", null, "", "");

        // A BESPOKE SUBJECT CARRIES NO PORTRAIT.
        //
        // The likeness attachment is an instruction: "paint this face". For a
        // station whose subject is not a persona — Jubilee Kids Party, which is
        // two children — attaching any adult's portrait is a straight
        // contradiction of the prompt, and the portrait wins. That is how a kids
        // station came back as a man on a carousel: the host happened to be set
        // to Tahoma, so persona_Tahoma.png went up with it.
        //
        // No portrait is attached and no host clause is added; the style
        // reference still is, because that carries the house look rather than a
        // face. Which catalogue it comes from is Bespoke.StyleFrom.
        if (BespokeFor(job)?.NoPortrait == true)
        {
            string? bStyle = null; string bB64 = "", bName = "";
            if (ChkIncludeStyle.IsChecked == true)
            {
                var p = StyleReferencePathFor(job.Host, job);
                if (p != null)
                {
                    var sb = StyleBase64(p);
                    if (sb != null) { bStyle = p; bB64 = sb; bName = Path.GetFileName(p); }
                }
            }
            return new HostRef(false, null, "", "", "", bStyle, bB64, bName);
        }

        var slug = job.Host;
        var path = ReferencePathFor(slug);
        if (path == null) return new HostRef(true, null, "", "", FamilyNameFor(slug), null, "", "");

        var b64 = ReferenceBase64(path);
        if (b64 == null) return new HostRef(true, null, "", "", FamilyNameFor(slug), null, "", "");

        // The style reference is BEST EFFORT, unlike the portrait. A missing
        // album cover costs the picture its house look, which is a worse image;
        // a missing portrait costs it the right face, which is the wrong image.
        // Only the second is worth skipping a station over.
        string? stylePath = null; string styleB64 = "", styleName = "";
        if (ChkIncludeStyle.IsChecked == true)
        {
            stylePath = StyleReferencePathFor(slug, job);
            if (stylePath != null)
            {
                var sb = StyleBase64(stylePath);
                if (sb != null) { styleB64 = sb; styleName = Path.GetFileName(stylePath); }
                else stylePath = null;
            }
        }

        return new HostRef(true, path, b64, Path.GetFileName(path), FamilyNameFor(slug), stylePath, styleB64, styleName);
    }

    // ---- the style reference -------------------------------------------------
    //
    // WHY A SECOND ATTACHMENT EXISTS AT ALL.
    //
    // Three rewrites of the prompt tables produced three sets of documentary
    // snapshots — a crowd on a subway platform, figures small in frame, faces
    // indistinct. Nobody would click a station card that looked like that. The
    // JubiLujah album covers are what the house look actually is: one subject
    // filling the frame, luminous, cinematic backdrop, golden light, a refined
    // high-necked long-sleeved gown. That is not reachable by describing it —
    // every attempt to describe it landed back in reportage — and it is trivially
    // reachable by attaching one.
    //
    // So every turn now carries two images: the portrait says WHO, the cover says
    // WHAT IT SHOULD LOOK LIKE.

    /// <summary>Album covers per persona slug, resolved once and kept.</summary>
    private readonly Dictionary<string, List<string>> _artworkCache = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// One of the host persona's own JubiLujah album covers, chosen by the
    /// station so a persona's nine stations do not all quote the same cover.
    ///
    /// The main <c>&lt;CODE&gt;.png</c> covers only, not the
    /// <c>-support-N.webp</c> images beside them: the covers are the finished
    /// house look, the supports are working material and vary in how finished
    /// they are. Sorted before indexing, because Directory.EnumerateFiles makes
    /// no ordering promise and an unstable order would mean a station quoting a
    /// different cover on every launch.
    /// </summary>
    private string? StyleReferencePathFor(string hostSlug, Station job)
    {
        // A bespoke station can name the catalogue its look should come from,
        // rather than inheriting a persona's. Party Giggles is a catalogue and
        // not a member of the family, so FamilyNameFor would reject it.
        var bespokeStyle = BespokeFor(job)?.StyleFrom;
        var key = bespokeStyle ?? hostSlug;
        if (bespokeStyle == null && FamilyNameFor(hostSlug).Length == 0) return null;

        if (!_artworkCache.TryGetValue(key, out var covers))
        {
            covers = new List<string>();
            try
            {
                // A family persona's albums live under "<slug>-inspire"; a
                // catalogue that is not a persona is simply its own folder.
                foreach (var candidate in new[] { key.ToLowerInvariant() + "-inspire", key.ToLowerInvariant() })
                {
                    var dir = Path.Combine(_artworkRoot, candidate);
                    if (!Directory.Exists(dir)) continue;
                    foreach (var album in Directory.EnumerateDirectories(dir))
                    {
                        var art = Path.Combine(album, "artwork");
                        if (!Directory.Exists(art)) continue;
                        foreach (var f in Directory.EnumerateFiles(art, "*.png"))
                            if (!Path.GetFileNameWithoutExtension(f).Contains("-support", StringComparison.OrdinalIgnoreCase))
                                covers.Add(f);
                    }
                    if (covers.Count > 0) break;
                }
            }
            catch (Exception ex) { Log($"  ⚠ Could not read {key}'s album artwork: {ex.Message}"); }
            covers.Sort(StringComparer.OrdinalIgnoreCase);
            _artworkCache[key] = covers;
        }

        if (covers.Count == 0) return null;
        return covers[(int)(Hash(job.Slug, 0x5BF03635u) % (uint)covers.Count)];
    }

    /// <summary>
    /// A cover as a base64 JPEG. Square sources, so no crop — unlike the
    /// portraits, the whole frame is the reference here: the backdrop, the light
    /// and the subject's scale within the frame are exactly what is being quoted.
    /// </summary>
    private string? StyleBase64(string path)
    {
        if (_referenceCache.TryGetValue(path, out var hit)) return hit;
        try
        {
            using var image = SixLabors.ImageSharp.Image.Load(File.ReadAllBytes(path));
            image.Mutate(x => x.Resize(new SixLabors.ImageSharp.Processing.ResizeOptions
            {
                Mode = SixLabors.ImageSharp.Processing.ResizeMode.Max,
                Size = new SixLabors.ImageSharp.Size(ReferenceMaxEdge, ReferenceMaxEdge),
            }));
            using var ms = new MemoryStream();
            image.Save(ms, new SixLabors.ImageSharp.Formats.Jpeg.JpegEncoder { Quality = 88 });
            var b64 = Convert.ToBase64String(ms.ToArray());
            _referenceCache[path] = b64;
            return b64;
        }
        catch (Exception ex)
        {
            Log($"  ⚠ Could not read the album cover {Path.GetFileName(path)}: {ex.Message}");
            return null;
        }
    }

    /// <summary>Count what artwork is reachable, once, at startup.</summary>
    private void ReportArtworkCoverage()
    {
        if (ChkIncludeStyle.IsChecked != true) { ArtworkCount.Text = "Style reference off — the look is described in words only."; return; }
        if (!Directory.Exists(_artworkRoot))
        {
            ArtworkCount.Text = "Not found. Renders will fall back to words alone.";
            Log($"⚠ Album artwork root not found: {_artworkRoot}");
            return;
        }
        int total = 0, voices = 0;
        foreach (var (slug, _) in Family)
        {
            var n = StyleReferencePathFor(slug, new Station { Slug = "probe" }) == null
                ? 0 : (_artworkCache.TryGetValue(slug, out var l) ? l.Count : 0);
            if (n > 0) voices++;
            total += n;
        }
        ArtworkCount.Text = $"{total} album covers across {voices} of 12 voices.";
        Log($"Style references: {total} album cover(s) across {voices} of the twelve, from {_artworkRoot}.");
    }

    private async Task<bool> GenerateOne(Station job, bool newThread, CancellationToken ct)
    {
        // Resolve the host BEFORE the browser is touched. A missing portrait is a
        // data problem, not a generation problem, and finding it out here costs
        // nothing — whereas finding it out after a new conversation has been
        // opened and the page has settled costs the better part of a minute per
        // station, and there are eight or nine of them behind every absent voice.
        var host = ResolveHost(job);
        if (host.Required && host.Reference == null)
        {
            Log($"  ✗ No host reference for \"{FamilyNameFor(job.Host)} Inspire\".");
            Log($"    Looked in: {_personasRoot}");
            Log("    Nothing sent. This station stays pending so a later run can pick it up.");
            return false;
        }

        var prompt = StationPrompt(job, host.FirstName);
        Log("  prompt: " + Truncate(prompt, 200) + (prompt.Length > 200 ? "…" : ""));

        var first = await AttemptOne(job, newThread, prompt, host, ct);
        if (first.Src != null) return await SaveImage(await VerifyHostRender(first.Src, host, ct), job, prompt, ct);

        // The content filter refused the PROMPT. A fresh conversation cannot help,
        // because the prompt is what was rejected and it would be rejected again.
        // Rewrite it and resubmit, softening one more likely trigger each pass.
        //
        // Nothing is written back to disk when a rewrite works, unlike the
        // InspireManna build: the prompt here is COMPOSED, not stored, so the next
        // run would rebuild the refused wording from scratch anyway. What that
        // means in practice is that a station which only renders after a pass-3
        // rewrite will need those same rewrites every time — worth noticing in the
        // log if it starts happening to a whole programming type, because the fix
        // then belongs in the table that composed it.
        if (first.PolicyRefused)
        {
            var working = prompt;
            for (int pass = 1; pass <= 5; pass++)
            {
                ct.ThrowIfCancellationRequested();
                var rewritten = SanitizeForFilter(prompt, pass);
                if (rewritten == working) continue;   // this pass changed nothing
                working = rewritten;

                var pause = _rng.Next(8000, 15001);
                Log($"  Content filter refused the prompt. Rewriting (pass {pass} of 5) and resubmitting in {pause / 1000}s…");
                Log($"    new prompt: {Truncate(rewritten, 140)}{(rewritten.Length > 140 ? "…" : "")}");
                await Task.Delay(pause, ct);

                var retry = await AttemptOne(job, true, rewritten, host, ct);
                if (retry.Src != null)
                    return await SaveImage(await VerifyHostRender(retry.Src, host, ct), job, rewritten, ct);
                if (!retry.PolicyRefused)
                {
                    // It stopped being a policy problem and became something else.
                    // Escalating the rewrite would only degrade the picture.
                    Log("  The filter stopped objecting, but the turn still produced no image.");
                    break;
                }
            }
            Log("  ✗ The content filter refused every rewrite. Leaving this station pending.");
            return false;
        }

        // A turn that died on ChatGPT's own failure banner is worth one more go,
        // but in a BRAND NEW conversation. The page's Retry button re-runs the
        // same wedged turn and tends to fail the same way; a fresh thread gets a
        // fresh one. Every other kind of miss falls straight through, because
        // resending an identical prompt would just burn another turn.
        if (first.PageFailed)
        {
            var pause = _rng.Next(30000, 60001);
            Log($"  That conversation is wedged. Starting a fresh one in {pause / 1000}s and trying this station once more…");
            await Task.Delay(pause, ct);
            var second = await AttemptOne(job, true, prompt, host, ct);
            if (second.Src != null) return await SaveImage(await VerifyHostRender(second.Src, host, ct), job, prompt, ct);
        }
        return false;
    }

    /// <summary>
    /// Look at the render before keeping it.
    ///
    /// The prompt can be perfect and the picture still wrong: on InspireManna,
    /// Jubilee was regenerated three times from a prompt that said "thirty" and
    /// "slender" in four places and came back sixty and heavy every time. Words
    /// are a request; this is the check. In the SAME conversation, the model is
    /// asked to look at the image it just made and answer PASS or FAIL against
    /// the host's age and build. On FAIL it is told, still in the same thread, to
    /// render the same picture again with the host corrected, and the new image
    /// replaces the old. Up to two corrections; then the last image stands and the
    /// log says so, because a picture that needs a human eye is better than no
    /// picture and the log is where that eye is pointed.
    ///
    /// Best effort throughout: any failure to ask, read or re-render keeps the
    /// original src rather than losing an image that was already generated.
    /// </summary>
    private async Task<string> VerifyHostRender(string src, HostRef host, CancellationToken ct)
    {
        if (!host.Required || host.FirstName.Length == 0) return src;

        // ONLY THE PERSONAS THAT ACTUALLY DRIFT. The check costs a round trip and
        // up to two re-renders, so on a full sweep it would spend that on twelve
        // hosts to catch a fault that only ever appears in one. A LIST RATHER THAN
        // AN IF, because the next persona to start drifting should be one word
        // here and not a code change with a shape to it.
        if (!VerifyRenderFor.Contains(host.FirstName)) return src;

        var name = host.FirstName;
        var current = src;
        for (int round = 1; round <= 2; round++)
        {
            ct.ThrowIfCancellationRequested();
            string verdict;
            try
            {
                Log($"  Checking the render: is {name} {AgePhrase(name)}, slender and lean?");
                var ask =
                    "Look carefully at the image you just generated. In it, " + name + " should be " + AgePhrase(name) +
                    ", slender and lean, tall and light framed" +
                    (HairOverride(name).Length > 0 ? ", with a glossy bright pale blonde bob" : "") + ". " +
                    "Judge only " + name + "'s apparent age and build as actually rendered. " +
                    "Reply with exactly one word: PASS if " + name + " clearly matches that, or FAIL if " + name +
                    " looks noticeably older than described" + (name == "Elias" ? "" : ", has grey or white hair") +
                    ", or has a heavy, stocky or full build. One word only.";
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                cts.CancelAfter(TimeSpan.FromMinutes(2));
                verdict = (await AskForText(ask, cts.Token) ?? "").Trim();
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested) { Log("  Render check timed out; keeping the image."); return current; }
            catch (Exception ex) { Log("  Render check failed (" + ex.Message + "); keeping the image."); return current; }

            var failed = Regex.IsMatch(verdict, @"\bFAIL\b", RegexOptions.IgnoreCase) && !Regex.IsMatch(verdict, @"\bPASS\b", RegexOptions.IgnoreCase);
            if (!failed)
            {
                Log(verdict.Length == 0 ? "  Render check gave no answer; keeping the image." : $"  ✓ Render check: {Truncate(verdict, 60)}");
                return current;
            }

            Log($"  ✗ Render check FAILED for {name} (round {round} of 2). Asking for the same picture with {name} corrected…");
            try
            {
                var baseline = new HashSet<string>(await GetImageList());
                var fix =
                    "Generate that exact same image again, same backdrop, same white headphones, same movement, " +
                    "same golden glow and warm yellow light, still a single figure filling the frame, " +
                    "with one correction: " + name + " must be rendered as " + AgePhrase(name) + ", " + FacePhrase(name) + " " +
                    name + " is tall at six feet, slender and lean, light framed and trim, long limbed with narrow shoulders and a slim waist. " +
                    (HairOverride(name).Length > 0 ? HairOverride(name) + " " : "") +
                    (name == "Jubilee"
                        ? "Jubilee is dressed modestly in white only, head to toe: a high neckline closed at the collarbone, " +
                          "sleeves covering her arms, and a hem well below the knee. "
                        : "") +
                    "Take only the facial features from the attached likeness reference; the age, build and hair are as written here. " +
                    "No text anywhere in the image." + AspectSuffix;
                var submit = Json(await Wv.CoreWebView2.ExecuteScriptAsync(SubmitScript(fix)));
                if (submit == "no-composer" || submit.StartsWith("mismatch", StringComparison.Ordinal))
                {
                    Log("  Could not send the correction; keeping the image.");
                    return current;
                }
                if (!await ConfirmSent(ct))
                {
                    Log("  The correction would not send; keeping the image.");
                    return current;
                }
                Log("  Waiting for the corrected image…");
                var (nsrc, pageFailed, policyRefused, _) = await WaitForNewImage(baseline, ct);
                if (nsrc == null)
                {
                    Log(policyRefused ? "  The correction was refused by the filter; keeping the previous image."
                      : pageFailed ? "  The correction turn failed; keeping the previous image."
                      : "  No corrected image arrived; keeping the previous image.");
                    return current;
                }
                current = nsrc;
                Log("  ✓ Corrected image finished.");
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested) { return current; }
            catch (Exception ex) { Log("  Correction failed (" + ex.Message + "); keeping the previous image."); return current; }
        }
        Log($"  ⚠ {name} still failed the render check after two corrections. The last image is kept; look at it before it goes near the site.");
        return current;
    }

    private async Task<Attempt> AttemptOne(Station job, bool newThread, string promptText, HostRef host, CancellationToken ct)
    {
        if (newThread)
        {
            var loc = string.IsNullOrWhiteSpace(LocationUrl.Text) ? CHATGPT : LocationUrl.Text.Trim();
            Log($"  Opening a new conversation ({loc})…");
            await NavigateAndWait(loc, ct);
        }
        else
        {
            Log("  Continuing in the same conversation…");
        }
        if (!await WaitForComposer(ct)) { Log("  ✗ Chat box never appeared — are you logged in? (composer not found)"); return new Attempt(null, false, false, false); }

        // The composer element exists well before the page has finished wiring up
        // its session and conversation state, and a prompt submitted into that gap
        // is the single most reliable way to earn "Something went wrong" on the
        // very first image of a run. Waiting for the box to appear is necessary
        // and is not sufficient; give the rest of the page a moment to catch up.
        if (newThread)
        {
            var settle = _rng.Next(3500, 6001);
            Log($"  Letting the page settle {settle / 1000.0:0.0}s before typing…");
            await Task.Delay(settle, ct);
        }

        // The host portrait goes on BEFORE the baseline is taken, because the
        // attachment thumbnail is itself an image on the page and would otherwise
        // read as the generated result. It also goes on before the prompt is
        // typed: ProseMirror keeps its text across an attach, but the reverse
        // order has the upload racing the send.
        if (host.Required)
        {
            var refs = new List<(string, string, string)>
            {
                (host.Base64, host.FileName, "likeness reference"),
            };
            // The cover goes on SECOND so "the second attached image" in the
            // prompt names it unambiguously.
            if (host.StylePath != null) refs.Add((host.StyleBase64, host.StyleFileName, "style reference"));

            if (!await AttachReferences(refs, ct))
            {
                Log($"  ✗ {host.FirstName} could not be attached, so nothing was sent. This station stays pending.");
                return new Attempt(null, false, false, false);
            }
        }

        // Remember which images are already on the page so we only accept a NEW one.
        var baseline = new HashSet<string>(await GetImageList());
        Log($"  Sending prompt… ({baseline.Count} image(s) already on the page)");

        // Flatten to a single line before sending. The composer treats a newline
        // as a paragraph break and only the last paragraph survives, so any
        // multi-line prompt would arrive truncated.
        //
        // Order matters at the tail: the scene, then who to put in it, then the
        // aspect ratio last, because the last instruction is the one the web UI
        // honours most reliably and a wrong ratio wastes the whole turn.
        var oneLine = Regex.Replace(promptText, @"\s+", " ").Trim();

        // The composed prompt ends "…, 16:9" by construction, so without this the
        // host clause would run straight on from the ratio. Cheap to close the
        // sentence first.
        if (oneLine.Length > 0 && !".!?".Contains(oneLine[^1])) oneLine += ".";

        var full = oneLine
                 + (host.Required ? HostClause(host.FirstName, host.StylePath != null, BespokeFor(job)?.Wardrobe) : "")
                 + AspectSuffix;
        if (host.Required) Log($"  Host in this image: {host.FirstName}, listening along, dressed for the scene.");
        var submit = Json(await Wv.CoreWebView2.ExecuteScriptAsync(SubmitScript(full)));
        Log($"  submit result: {submit}");
        if (submit == "no-composer") { Log("  ✗ Could not find the chat box to type into."); return new Attempt(null, false, false, false); }
        if (submit.StartsWith("mismatch", StringComparison.Ordinal))
        {
            // Nothing was sent. Sending a fragment is worse than sending nothing:
            // it burns a turn and produces an image for the wrong description.
            Log("  ✗ The composer did not receive the full prompt, so nothing was sent.");
            return new Attempt(null, false, false, false);
        }
        if (!await ConfirmSent(ct))
        {
            // The prompt is correct and still sitting in the box. Reported as a
            // page failure so the caller retries in a fresh conversation, which is
            // the same recovery a wedged turn already gets.
            Log("  ✗ The prompt would not send; it is still in the composer.");
            return new Attempt(null, true, false, false);
        }

        Log("  Waiting for the image to finish generating…");
        var (src, pageFailed, policyRefused, staleAccepted) = await WaitForNewImage(baseline, ct);
        if (src == null)
        {
            if (!pageFailed && !policyRefused)
                Log("  ✗ No finished image detected (ChatGPT may have asked a question, refused, or its layout changed).");
            return new Attempt(null, pageFailed, policyRefused, false);
        }
        Log("  ✓ Image finished — downloading…");
        return new Attempt(src, false, false, staleAccepted);
    }

    /// <summary>
    /// Ask a question in the current conversation and read the answer.
    /// Used by the render check.
    /// </summary>
    private async Task<string?> AskForText(string question, CancellationToken ct)
    {
        var before = Json(await Wv.CoreWebView2.ExecuteScriptAsync(LastReplyScript()));
        var submit = Json(await Wv.CoreWebView2.ExecuteScriptAsync(SubmitScript(question)));
        if (submit == "no-composer") { Log("  Could not find the chat box."); return null; }

        // Typing the question is not asking it. Without this the composer could
        // sit fully typed and unsent while the poll below burned its whole two
        // minutes waiting for an answer to a question nobody had heard.
        if (!await ConfirmSent(ct))
        {
            Log("  The question would not send; the prompt is still in the composer.");
            return null;
        }

        var deadline = DateTime.UtcNow.AddMinutes(2);
        string? last = null;
        int stable = 0;
        while (DateTime.UtcNow < deadline)
        {
            ct.ThrowIfCancellationRequested();
            await Task.Delay(2500, ct);
            var now = Json(await Wv.CoreWebView2.ExecuteScriptAsync(LastReplyScript()));
            if (string.IsNullOrWhiteSpace(now) || now == before) continue;
            // Same text twice running means the stream has finished.
            if (now == last) { if (++stable >= 2) return now; }
            else { last = now; stable = 1; }
        }
        return last;
    }

    /// <summary>The newest assistant message as plain text.</summary>
    private static string LastReplyScript() =>
        "(function(){var n=document.querySelectorAll('[data-message-author-role=\"assistant\"]');" +
        "if(!n.length)return '';var t=(n[n.length-1].innerText||'').trim();return t;})();";

    private static string Truncate(string s, int n) => s.Length <= n ? s : s.Substring(0, n);

    /// <summary>
    /// Soften a prompt the content filter refused, one more trigger per pass.
    ///
    /// Composed prompts are far less likely to trip the filter than the article
    /// prompts this machinery was written for — there is no grief, no hospital and
    /// no injury anywhere in the station tables. It is kept because "unlikely" is
    /// not "never" across a hundred and two turns, and because a refusal with no
    /// rewrite path means a station that can never be generated at all.
    /// </summary>
    private static string SanitizeForFilter(string prompt, int pass)
    {
        var p = prompt;

        if (pass >= 1)
        {
            // Minors are the class the filter guards hardest. The station tables
            // deliberately name adults and families rather than children, so this
            // pass usually finds nothing — but "a family" can still be read as
            // containing them, so the words go first.
            p = Regex.Replace(p, @"\b(?:child|children|kid|kids|boy|boys|girl|girls|toddler|infant|baby|babies|teenager|teen)\b", "person", RegexOptions.IgnoreCase);
            p = Regex.Replace(p, @"\b(?:a |an )?(?:young|little|small|older|elderly)\s+(?=(?:man|woman|person|couple|family|friend))", "a ", RegexOptions.IgnoreCase);
            p = Regex.Replace(p, @"\b(?:a|an|the)?\s*\b\d{1,3}[-\s]year[-\s]old\b", "adult", RegexOptions.IgnoreCase);
        }

        if (pass >= 2)
        {
            // Physical closeness and bedrooms. The sleep stations put a listener
            // on a bed, which is innocuous and occasionally read otherwise.
            p = Regex.Replace(p, @"\b(?:resting against the pillows|sitting on the edge of the bed|resting on the blanket)\b", "sitting in a chair by the window", RegexOptions.IgnoreCase);
            p = Regex.Replace(p, @"\b(?:bedroom|bedside|nightstand|bed)\b", "quiet room", RegexOptions.IgnoreCase);
            p = Regex.Replace(p, @"\b(?:embracing|hugging|holding hands|arm in arm)\b", "standing together", RegexOptions.IgnoreCase);
        }

        if (pass >= 3)
        {
            // Named faith figures, and the one face that is never depicted.
            p = Regex.Replace(p, @"\b(?:Yeshua|Jesus|Christ|Messiah|Yahuah|God|the Father)\b", "a figure of welcome", RegexOptions.IgnoreCase);
            p = Regex.Replace(p, @"\b(?:Bible|Bibles|Scripture)\b", "open book", RegexOptions.IgnoreCase);
        }

        if (pass >= 4)
        {
            // Places a classifier may read as sensitive rather than domestic.
            p = Regex.Replace(p, @"\b(?:chapel|Sabbath|feast day|service)\b", "gathering", RegexOptions.IgnoreCase);
            p = Regex.Replace(p, @"\b(?:prayer|praying|head bowed|hands open)\b", "quiet reflection", RegexOptions.IgnoreCase);
        }

        if (pass >= 5)
        {
            // Last resort. Keep the three things that make this a kJubilee
            // picture — an adult listening, the white headphones, and the golden
            // glow — and drop every other piece of staging the filter might have
            // objected to. One adult stays in the frame because that is the slot
            // the host clause then fills; a people-free scene has nowhere to put
            // them, and the movement stays because a still one is the picture this
            // whole rewrite exists to stop making.
            p = "Album cover artwork: a single woman alone, filling the frame, shot from the waist up against a wide "
              + "soft cinematic sky, wearing clean matte white over-ear headphones with no lettering or branding on them, "
              + "caught mid-turn with her hair lifting and her face raised into the light, the only person in the picture, "
              + "the whole image bathed in a golden glow of low warm yellow light, luminous, painterly photorealism, "
              + "richly detailed, no text anywhere in the image, 16:9";
        }

        // Tidy the damage the substitutions leave behind.
        p = Regex.Replace(p, @"\s{2,}", " ");
        p = Regex.Replace(p, @"\s+,", ",");
        p = Regex.Replace(p, @",\s*,+", ",");
        p = Regex.Replace(p, @"^\s*,\s*", "");
        p = p.Trim();

        if (!Regex.IsMatch(p, @"16:9\s*$")) p = p.TrimEnd(',', ' ') + ", 16:9";
        return p;
    }

    // Waits for a generated image that (a) was not already present before we
    // submitted, and (b) holds the same URL across two consecutive polls — i.e.
    // generation has settled, not a streaming/placeholder frame.
    //
    // It also watches for ChatGPT's own failure state. When a turn dies with
    // "Something went wrong. Please try again." no image is ever coming, and
    // without this the code could not tell that apart from a slow render: it sat
    // out the full six-minute deadline on a turn that had already failed, then
    // reported a generic timeout.
    //
    // The failure is detected within a poll and retried on the page's own Retry
    // button with a BACKOFF. That matters more than the retry count does.
    // "Something went wrong" is overwhelmingly a capacity or rate signal, and
    // answering it by pressing Retry six seconds later is well inside the window
    // that produced the error in the first place. Backing off 20s, then 45s, then
    // 90s costs at most two and a half minutes on a genuinely dead turn and
    // rescues most of the transient ones.
    private async Task<(string? Src, bool PageFailed, bool PolicyRefused, bool StaleAccepted)> WaitForNewImage(HashSet<string> baseline, CancellationToken ct)
    {
        // The deadline is extended per retry, so a slow-but-alive turn is not
        // killed by time spent deliberately waiting out a backoff.
        var deadline = DateTime.UtcNow.AddMinutes(6);
        int[] backoff = { 20000, 45000, 90000 };
        string? last = null;
        DateTime? firstNewSeen = null;
        int stable = 0, polls = 0, retries = 0;
        while (DateTime.UtcNow < deadline)
        {
            ct.ThrowIfCancellationRequested();

            var current = await GetImageList();
            var newest = current.LastOrDefault(s => !baseline.Contains(s));
            if (newest != null)
            {
                if (firstNewSeen == null) firstNewSeen = DateTime.UtcNow;

                if (newest == last) stable++;
                else { last = newest; stable = 1; }
                if (stable >= 2) return (newest, false, false, false); // unchanged across two checks → done

                // THE SETTLE FALLBACK.
                //
                // The two-identical-polls rule assumes a finished image keeps one
                // src. It does not always: ChatGPT swaps the element's source as it
                // goes from a blob to a signed CDN URL, and a signed URL can be
                // reissued. When that churn outlasts the poll interval, `stable`
                // never reaches 2 and this loop sat out the whole six minutes on an
                // image that was finished and visible on screen the whole time.
                //
                // So after two minutes of a new image being continuously present,
                // take it. A picture that has been on the page that long is not a
                // streaming frame. The URL is read at that instant and downloaded
                // immediately, which is what makes taking the unstable one safe.
                //
                // The caller is told to start a fresh conversation afterwards: a
                // thread whose image URLs are still churning after two minutes is
                // usually wedged, and the next station in the same thread tends to
                // hit the same thing.
                if (DateTime.UtcNow - firstNewSeen.Value >= TimeSpan.FromMinutes(2))
                {
                    Log($"    Image has been on the page {(int)(DateTime.UtcNow - firstNewSeen.Value).TotalSeconds}s but its URL keeps changing.");
                    Log("    Taking it as finished and starting a fresh conversation for the next one.");
                    return (newest, false, false, true);
                }
            }
            else
            {
                // It vanished (a re-render). Start the clock again rather than
                // carrying a stale age into the next image.
                firstNewSeen = null;
            }

            // The content-policy refusal, checked FIRST because it is terminal for
            // this prompt. No image is coming and no amount of waiting or retrying
            // changes that, so returning immediately saves the rest of the
            // six-minute deadline.
            if (newest == null && Json(await Wv.CoreWebView2.ExecuteScriptAsync(ContentPolicyScript())) == "yes")
            {
                Log("    The content filter refused this prompt. No image is coming for this wording.");
                return (null, false, true, false);
            }

            // Only look for the failure banner while no image has appeared: once
            // one is rendering, a stale banner further up the thread is irrelevant.
            if (newest == null && Json(await Wv.CoreWebView2.ExecuteScriptAsync(ErrorPresentScript())) == "yes")
            {
                if (retries < backoff.Length)
                {
                    var wait = backoff[retries];
                    retries++;
                    Log($"    ChatGPT reported \"Something went wrong\" (attempt {retries} of {backoff.Length}). Waiting {wait / 1000}s, then pressing its Retry…");
                    await Task.Delay(wait, ct);
                    ct.ThrowIfCancellationRequested();
                    var clicked = Json(await Wv.CoreWebView2.ExecuteScriptAsync(ClickRetryScript()));
                    if (clicked != "clicked")
                    {
                        // The banner was there a moment ago and the button is not.
                        // Retrying a button that no longer exists is pointless.
                        Log("    The Retry button went away before it could be pressed.");
                        return (null, true, false, false);
                    }
                    deadline = deadline.AddMilliseconds(wait + 30000);
                    await Task.Delay(6000, ct);
                    continue;
                }
                Log($"    ✗ ChatGPT failed this turn {backoff.Length + 1} times, backing off each time.");
                return (null, true, false, false);
            }

            if (++polls % 5 == 0)
                Log($"    …still waiting ({current.Count} image(s) on page, ~{(int)(deadline - DateTime.UtcNow).TotalSeconds}s left)");
            await Task.Delay(3000, ct);
        }
        Log("    ✗ Timed out waiting for the image.");
        return (null, false, false, false);
    }

    private async Task<List<string>> GetImageList()
    {
        var r = await Wv.CoreWebView2.ExecuteScriptAsync(ListImagesScript());
        try
        {
            var arr = JsonNode.Parse(r) as JsonArray;
            return arr?.Select(x => x!.GetValue<string>()).ToList() ?? new();
        }
        catch { return new(); }
    }

    // Fetch the image bytes inside the page (keeps the auth session), receive them
    // via a web message, re-encode to WebP, write <slug>.webp into the images
    // folder, and record what was made in the sidecar manifest.
    private async Task<bool> SaveImage(string src, Station job, string prompt, CancellationToken ct)
    {
        _imageMsg = new TaskCompletionSource<string>();
        await Wv.CoreWebView2.ExecuteScriptAsync(FetchScript(src));
        var b64 = await WaitForMessage(TimeSpan.FromSeconds(60), ct);
        if (b64 == null) { Log("  Failed to download the image bytes."); return false; }

        try
        {
            var original = Convert.FromBase64String(b64);
            Directory.CreateDirectory(_imagesRoot);

            // Convert as soon as it lands. ChatGPT hands back multi-megabyte
            // PNG/JPEG; WebP is a fraction of that for the same picture, and
            // storing one format keeps every consumer from having to care which
            // extension a given station happens to use.
            var (bytes, ext) = ToWebp(original, out var note);
            if (note.Length > 0) Log("  " + note);

            var fileName = job.Slug + ext;
            var dest = Path.Combine(_imagesRoot, fileName);
            await File.WriteAllBytesAsync(dest, bytes, ct);

            // Remove a previous render of this station in another format, or the
            // folder accumulates an orphan .jpg beside every new .webp — and
            // ExistingImage would then keep finding whichever one it checks first.
            foreach (var stale in StaleSiblings(_imagesRoot, job.Slug, fileName))
            {
                try { File.Delete(stale); Log($"  Removed superseded {Path.GetFileName(stale)}"); }
                catch { /* not worth failing the save over */ }
            }

            job.ImageFile = fileName;
            RecordInManifest(job, fileName, prompt);

            // Straight out to the CDN. Deliberately after the local write and
            // the manifest, so a publish that fails leaves a complete local
            // record to retry from rather than losing the render.
            if (_publishEnabled) await PublishOne(dest, job.Slug, ct);

            var saved = original.Length > 0 ? 100 - (int)(bytes.LongLength * 100 / original.LongLength) : 0;
            Log($"  Saved {fileName}  ({bytes.Length:N0} bytes"
                + (ext == WebpExt ? $", {saved}% smaller than the {original.Length:N0} byte original)" : ")"));
            return true;
        }
        catch (Exception ex)
        {
            Log("  ✗ Could not save the image: " + ex.Message);
            return false;
        }
    }

    /// <summary>
    /// Record what was generated, beside the images.
    ///
    /// NOT the source of truth — the file on disk is, and ExistingImage asks the
    /// disk. This is the provenance: which persona is in that picture, what
    /// wording produced it, and when. Six months from now "why is Zev on the
    /// Swahili station" is a question only this file can answer, and a prompt that
    /// produced a good render is worth keeping even though the composer would
    /// rebuild it from the tables.
    ///
    /// A failure here is logged and swallowed. Losing the manifest is a nuisance;
    /// failing the save of an image that has already cost a GPU render, and
    /// thereby requeueing it, is worse.
    /// </summary>
    private void RecordInManifest(Station job, string fileName, string prompt)
    {
        var path = Path.Combine(_imagesRoot, ManifestName);
        try
        {
            JsonObject root;
            try { root = JsonNode.Parse(File.ReadAllText(path)) as JsonObject ?? new JsonObject(); }
            catch { root = new JsonObject(); }

            root["schema"] = "kj.station.images/1";
            root["generated"] = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            if (root["stations"] is not JsonObject stations) { stations = new JsonObject(); root["stations"] = stations; }

            stations[job.Slug] = new JsonObject
            {
                ["file"] = fileName,
                ["name"] = job.Name,
                ["hm"] = job.Hm,
                ["host"] = job.Host,
                ["hostName"] = FamilyNameFor(job.Host) + " Inspire",
                ["rendered"] = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                ["prompt"] = prompt,
            };

            File.WriteAllText(path, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }),
                              new UTF8Encoding(false));
        }
        catch (Exception ex) { Log("  ⚠ Image saved, but the manifest could not be updated: " + ex.Message); }
    }

    private const string ManifestName = "stations-images.json";

    // ---- image conversion ----------------------------------------------------

    private const string WebpExt = ".webp";

    /// <summary>
    /// WebP quality for saved station images. 82 is visually indistinguishable
    /// from the source on photographic content and lands around a tenth of the
    /// bytes; higher buys nothing a listener can see.
    /// </summary>
    private const int WebpQuality = 82;

    /// <summary>
    /// Re-encode a downloaded image as WebP.
    ///
    /// Falls back to the original bytes, under their true extension, if the encode
    /// fails or comes out no smaller. Losing a generated image to a conversion
    /// problem would cost a GPU render and silently drop the station back into the
    /// queue, so the original always wins over nothing.
    /// </summary>
    /// <returns>The bytes to write and the extension to write them under.</returns>
    private static (byte[] Bytes, string Ext) ToWebp(byte[] source, out string note)
    {
        note = "";
        try
        {
            using var image = SixLabors.ImageSharp.Image.Load(source);
            using var ms = new MemoryStream();
            image.Save(ms, new SixLabors.ImageSharp.Formats.Webp.WebpEncoder
            {
                Quality = WebpQuality,
                FileFormat = SixLabors.ImageSharp.Formats.Webp.WebpFileFormatType.Lossy,
            });
            var webp = ms.ToArray();

            if (webp.Length == 0 || webp.Length >= source.Length)
            {
                note = $"WebP came out {webp.Length:N0} bytes vs {source.Length:N0} original; keeping the original.";
                return (source, SniffExtension(source));
            }
            return (webp, WebpExt);
        }
        catch (Exception ex)
        {
            note = "WebP conversion failed (" + ex.Message + "); saving the original instead.";
            return (source, SniffExtension(source));
        }
    }

    /// <summary>
    /// The real extension for a byte buffer, from its magic number. Never trust
    /// the URL: ChatGPT serves these from blob/CDN paths that carry no format.
    /// </summary>
    private static string SniffExtension(byte[] b)
    {
        if (b.Length >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47) return ".png";
        if (b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return ".jpg";
        if (b.Length >= 12
            && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
            && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return WebpExt;
        return ".jpg";
    }

    /// <summary>
    /// Other renders of the same station sitting beside the one just written — a
    /// `.png` left over from a run where the WebP encode failed, for instance.
    /// </summary>
    private static IEnumerable<string> StaleSiblings(string imagesDir, string slug, string keep)
    {
        foreach (var ext in new[] { ".jpg", ".jpeg", ".png", WebpExt })
        {
            var name = slug + ext;
            if (string.Equals(name, keep, StringComparison.OrdinalIgnoreCase)) continue;
            var path = Path.Combine(imagesDir, name);
            if (File.Exists(path)) yield return path;
        }
    }

    // ---- navigation + messaging helpers --------------------------------------
    // Best-effort navigation: waits for the "completed" event but never hangs on
    // it — after the timeout it proceeds, and WaitForComposer confirms the page is
    // actually usable.
    private async Task NavigateAndWait(string url, CancellationToken ct)
    {
        var tcs = new TaskCompletionSource<bool>();
        void handler(object? s, CoreWebView2NavigationCompletedEventArgs e) => tcs.TrySetResult(e.IsSuccess);
        Wv.CoreWebView2.NavigationCompleted += handler;
        try
        {
            Wv.CoreWebView2.Navigate(url);
            await Task.WhenAny(tcs.Task, Task.Delay(25000, ct));
        }
        catch (OperationCanceledException) { }
        finally
        {
            Wv.CoreWebView2.NavigationCompleted -= handler;
        }
    }

    private async Task<bool> WaitForComposer(CancellationToken ct)
    {
        var deadline = DateTime.UtcNow.AddSeconds(40);
        while (DateTime.UtcNow < deadline)
        {
            ct.ThrowIfCancellationRequested();
            if (Json(await Wv.CoreWebView2.ExecuteScriptAsync(ComposerPresentScript())) == "yes") return true;
            await Task.Delay(1000, ct);
        }
        return false;
    }

    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var text = e.TryGetWebMessageAsString();
            var node = JsonNode.Parse(text);
            var type = node?["type"]?.GetValue<string>();
            if (type == "image") _imageMsg?.TrySetResult(node!["b64"]!.GetValue<string>());
            else if (type == "error") { Log("  page fetch error: " + node?["message"]?.GetValue<string>()); _imageMsg?.TrySetResult(""); }
        }
        catch { /* ignore malformed messages from the page */ }
    }

    private async Task<string?> WaitForMessage(TimeSpan timeout, CancellationToken ct)
    {
        var msg = _imageMsg!;
        var completed = await Task.WhenAny(msg.Task, Task.Delay(timeout, ct));
        if (completed == msg.Task)
        {
            var v = await msg.Task;
            return string.IsNullOrEmpty(v) ? null : v;
        }
        return null;
    }

    // ---- injected scripts ----------------------------------------------------
    //
    // THE DOM SELECTORS ALL LIVE HERE. If a run stops finding the chat box, the
    // attachment or the image, this is the only place to adjust.
    private static string J(string s) => JsonSerializer.Serialize(s);

    // True when the newest turn carries ChatGPT's failure banner. Anchored to a
    // visible Retry button rather than to the phrase alone, so an old failure
    // scrolled further up the conversation cannot trigger a false positive.
    private static string ErrorPresentScript() =>
        "(function(){var b=document.querySelectorAll('button');" +
        "for(var i=b.length-1;i>=0;i--){var t=(b[i].innerText||'').trim();" +
        "if(/^retry$/i.test(t)){var r=b[i].getBoundingClientRect();" +
        "if(r.width>0&&r.height>0)return 'yes';}}" +
        "return 'no';})();";

    // True when the page is showing a CONTENT POLICY refusal.
    //
    // This is a different failure from "Something went wrong", and the difference
    // is why it needs its own detector: the policy refusal ships no Retry button,
    // so ErrorPresentScript never fires on it and the code would sit out the
    // entire six-minute deadline on a turn that was already dead. Worse, retrying
    // the identical prompt could not have helped, because the prompt is the
    // problem.
    //
    // Matched on the message text near the end of the thread rather than anywhere
    // on the page, so a refusal scrolled further up cannot trigger a false hit.
    private static string ContentPolicyScript() =>
        "(function(){var t=(document.body.innerText||'');" +
        "var tail=t.slice(-1800).toLowerCase();" +
        "var pats=['violate our content polic','content policies','this request may violate'," +
        "'i can\\u2019t create that image','i cannot create that image','i can\\u2019t generate that image'," +
        "'unable to generate that image','against our usage policies','flagged by our safety system'," +
        "'i\\u2019m not able to create','i am not able to create'];" +
        "for(var i=0;i<pats.length;i++){if(tail.indexOf(pats[i])>=0)return 'yes';}" +
        "return 'no';})();";

    private static string ClickRetryScript() =>
        "(function(){var b=document.querySelectorAll('button');" +
        "for(var i=b.length-1;i>=0;i--){var t=(b[i].innerText||'').trim();" +
        "if(/^retry$/i.test(t)){b[i].click();return 'clicked';}}" +
        "return 'none';})();";

    private static string ComposerPresentScript() =>
        "(function(){var b=document.querySelector('#prompt-textarea')||document.querySelector('div[contenteditable=\"true\"]');return b?'yes':'no';})();";

    // Types the prompt into the composer and sends it, but only after reading the
    // composer back and confirming it actually holds what we meant to send.
    //
    // The read-back is the important part. Without it, a composer that silently
    // dropped or mangled the text still got Enter pressed, and ChatGPT received a
    // fragment. That failure was invisible: the old script returned the string
    // 'submitted' whether or not the text had survived. It now refuses to press
    // send on a mismatch and hands the actual composer contents back for the log.
    private static string SubmitScript(string prompt) =>
        "(function(){var P=" + J(prompt) + ";" +
        "var box=document.querySelector('#prompt-textarea')||document.querySelector('div[contenteditable=\"true\"]');" +
        "if(!box)return 'no-composer';box.focus();" +
        "try{document.execCommand('selectAll',false,null);document.execCommand('insertText',false,P);}catch(e){}" +
        "var read=function(){return (box.innerText||box.textContent||'').replace(/\\s+/g,' ').trim();};" +
        "var got=read();" +
        "if(got.length===0){try{box.textContent=P;got=read();}catch(e){}}" +
        "box.dispatchEvent(new Event('input',{bubbles:true}));" +
        "var head=P.slice(0,40).replace(/\\s+/g,' ').trim();" +
        "if(got.indexOf(head)!==0)return 'mismatch|want:'+head+'|got:'+got.slice(0,90);" +
        SendLoopJs +
        "return 'submitted|'+got.length+' chars';})();";

    /// <summary>
    /// Keep pressing send until the composer is actually empty.
    ///
    /// WHY THIS IS A LOOP AND NOT A CLICK. It used to be one click, 450ms after
    /// the text went in, against two hard-coded selectors, and it returned
    /// 'submitted' whether or not anything had been sent. Both of those bite:
    /// ChatGPT renames the send control (data-testid and aria-label have both
    /// moved more than once), and even when the selector is right the button is
    /// disabled for a moment while React catches up with the input event, so a
    /// single early click lands on a dead button. The prompt then sits in the
    /// composer, fully typed, waiting for a human, and the run stalls two minutes
    /// until the read times out.
    ///
    /// So: find the button by four known shapes and then by any enabled button
    /// that says send, fall back to a full Enter key sequence, and retry for about
    /// eight seconds, stopping the moment the composer clears. Clicks are spaced
    /// roughly 1.2s apart so a click that DID work is never followed by a second
    /// one landing in the next turn.
    ///
    /// ExecuteScriptAsync does not await promises, so the loop runs in the page
    /// and the caller confirms separately with ComposerTextScript.
    /// </summary>
    private const string SendLoopJs =
        "var findSend=function(){" +
        "var sels=['button[data-testid=\"send-button\"]','button[aria-label=\"Send prompt\"]'," +
        "'button[aria-label=\"Send message\"]','form button[type=\"submit\"]'];" +
        "for(var i=0;i<sels.length;i++){var b=document.querySelector(sels[i]);if(b&&!b.disabled)return b;}" +
        "var bs=document.querySelectorAll('button');" +
        "for(var j=0;j<bs.length;j++){var c=bs[j];if(c.disabled)continue;" +
        "var l=((c.getAttribute('aria-label')||'')+' '+(c.getAttribute('title')||'')+' '+(c.getAttribute('data-testid')||'')).toLowerCase();" +
        // 'stop' and 'cancel' are excluded because the send control turns into
        // exactly those while a turn is generating, and clicking it would abort
        // the very answer we are waiting for.
        "if(l.indexOf('send')>=0&&l.indexOf('stop')<0&&l.indexOf('cancel')<0)return c;}" +
        "return null;};" +
        "var pressEnter=function(el){var mk=function(t){return new KeyboardEvent(t," +
        "{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true});};" +
        "el.dispatchEvent(mk('keydown'));el.dispatchEvent(mk('keypress'));el.dispatchEvent(mk('keyup'));};" +
        "var tries=0,lastClick=-9;var iv=setInterval(function(){tries++;" +
        "var cur=(box.innerText||box.textContent||'').replace(/\\s+/g,' ').trim();" +
        "if(cur.length===0){clearInterval(iv);return;}" +
        "if(tries-lastClick>=3){lastClick=tries;var b=findSend();if(b){b.click();}else{pressEnter(box);}}" +
        "if(tries>=20){clearInterval(iv);}},400);";

    /// <summary>
    /// What is sitting in the composer right now. Empty means the turn went. This
    /// is how the caller learns whether SendLoopJs actually succeeded, since the
    /// loop itself runs after the script has already returned.
    /// </summary>
    private static string ComposerTextScript() =>
        "(function(){var box=document.querySelector('#prompt-textarea')||document.querySelector('div[contenteditable=\"true\"]');" +
        "if(!box)return '';return (box.innerText||box.textContent||'').replace(/\\s+/g,' ').trim();})();";

    /// <summary>
    /// Wait for the composer to empty, which is the only reliable sign the turn
    /// was sent. Returns false if the text is still sitting there after the page
    /// loop has had its full run, so the caller can say so rather than waiting two
    /// minutes for a reply that was never asked for.
    /// </summary>
    private async Task<bool> ConfirmSent(CancellationToken ct)
    {
        for (var i = 0; i < 24; i++)          // 24 x 400ms = ~9.6s, just past the page loop
        {
            ct.ThrowIfCancellationRequested();
            await Task.Delay(400, ct);
            var left = Json(await Wv.CoreWebView2.ExecuteScriptAsync(ComposerTextScript()));
            if (left.Length == 0) return true;
        }
        return false;
    }

    // Returns every finished, LARGE image on the page, in DOM order (last = most
    // recent). We detect by size rather than URL: ChatGPT serves generated images
    // from signed URLs that don't match any fixed pattern, but the generated image
    // is always the big, fully-loaded one — UI chrome (avatars, icons, inline
    // SVGs) is small and gets filtered out by the size gate.
    //
    // USER TURNS AND THE COMPOSER ARE EXCLUDED, and that exclusion is load-bearing
    // now that every turn carries an attached host portrait. The portrait is a
    // 768px raster, so it clears the size gate comfortably; once the turn is sent
    // it renders again inside the user's own message bubble under a fresh URL that
    // is not in the baseline. Without this filter it would be the newest unseen
    // image on the page for as long as the generated one took to render, hold
    // still across two polls, and be saved as the station's picture — a station
    // illustrated with a neon studio portrait of its own host.
    //
    // The filter fails OPEN. If ChatGPT drops the data-message-author-role
    // attribute the closest() calls simply stop matching and this behaves exactly
    // as it did before, rather than finding no images at all and failing shut.
    private static string ListImagesScript() =>
        "(function(){var out=[];var imgs=document.querySelectorAll('img');" +
        "for(var i=0;i<imgs.length;i++){var im=imgs[i];var s=im.currentSrc||im.src||'';" +
        "if(!s||s.indexOf('data:image/svg')===0)continue;" +
        "try{if(im.closest('[data-message-author-role=\"user\"]'))continue;" +
        "if(im.closest('form'))continue;}catch(e){}" +
        "if(im.complete&&(im.naturalWidth||0)>=400&&(im.naturalHeight||0)>=400){out.push(s);}}" +
        "return out;})();";

    // ---- attaching the host portrait -----------------------------------------

    // Hands the portrait to the page as a real File.
    //
    // Two routes, tried in order, because ChatGPT's composer has changed shape
    // more than once and both have been the working one at different times:
    //
    //   1. The composer's hidden <input type=file>. Set .files from a DataTransfer
    //      and dispatch a bubbling 'change' — React listens for the native event
    //      at the document root, so this reaches its onChange handler the same way
    //      a real file picker would. Inputs advertising image/ are preferred: a
    //      page can carry others (avatar, data import) and the first one found is
    //      not necessarily the composer's.
    //   2. A synthetic paste carrying the same DataTransfer. ProseMirror handles
    //      pasted image data itself, which is the path a user takes with Ctrl+V.
    //
    // No drag-and-drop fallback. A synthetic dragover/drop pair is the least
    // reliable of the three and the hardest to tell "silently ignored" from
    // "accepted", and a silent miss here is exactly the failure this whole path
    // exists to prevent.
    private static string AttachScript(string b64, string fileName) =>
        "(function(){var B=" + J(b64) + ";var N=" + J(fileName) + ";" +
        "try{" +
        "var bin=atob(B);var arr=new Uint8Array(bin.length);" +
        "for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);" +
        "var file=new File([arr],N,{type:'image/jpeg'});" +
        "var dt=new DataTransfer();dt.items.add(file);" +
        "var ins=Array.prototype.slice.call(document.querySelectorAll('input[type=\"file\"]'));" +
        "ins.sort(function(a,b){var ai=((a.getAttribute('accept')||'').indexOf('image')>=0)?0:1;" +
        "var bi=((b.getAttribute('accept')||'').indexOf('image')>=0)?0:1;return ai-bi;});" +
        "for(var j=0;j<ins.length;j++){try{ins[j].files=dt.files;" +
        "if(ins[j].files&&ins[j].files.length===1){" +
        "ins[j].dispatchEvent(new Event('change',{bubbles:true}));return 'attached|input';}}catch(e){}}" +
        "var box=document.querySelector('#prompt-textarea')||document.querySelector('div[contenteditable=\"true\"]');" +
        "if(box){box.focus();" +
        "box.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));" +
        "return 'attached|paste';}" +
        "return 'no-target';}catch(e){return 'error|'+String(e);}})();";

    // Drops anything already pinned to the composer. Scoped to the composer's own
    // form so a "Remove" control belonging to some other part of the page is left
    // alone.
    private static string ClearAttachmentsScript() =>
        "(function(){var box=document.querySelector('#prompt-textarea')||document.querySelector('div[contenteditable=\"true\"]');" +
        "var form=box?box.closest('form'):null;if(!form)return 'cleared|0';" +
        "var n=0;var bs=form.querySelectorAll('button[aria-label]');" +
        "for(var i=0;i<bs.length;i++){var a=(bs[i].getAttribute('aria-label')||'').toLowerCase();" +
        "if(a.indexOf('remove')>=0||a.indexOf('delete')>=0){try{bs[i].click();n++;}catch(e){}}}" +
        "return 'cleared|'+n;})();";

    // 'ready' | 'uploading' | 'none' — whether the composer is showing the
    // attachment.
    //
    // Honest about its limits: ChatGPT does not expose "the upload finished" in
    // any stable way, so this reads the preview thumbnail instead — present and
    // decoded means the page has the file. The caller compensates by requiring the
    // state twice in a row and then waiting a beat, rather than trusting one poll.
    //
    // Scoped to the composer's form, and returns 'none' when there is no form to
    // scope to. Widening to the whole document instead would count the avatar in
    // the corner as an attachment and report ready when nothing was attached at
    // all, which is the one wrong answer that costs a station its host.
    private static string AttachmentStateScript() =>
        "(function(){var box=document.querySelector('#prompt-textarea')||document.querySelector('div[contenteditable=\"true\"]');" +
        "var form=box?box.closest('form'):null;if(!form)return 'none';" +
        "if(form.querySelector('[role=\"progressbar\"]'))return 'uploading';" +
        "var imgs=form.querySelectorAll('img');var found=0,loading=0;" +
        "for(var i=0;i<imgs.length;i++){var im=imgs[i];var s=im.currentSrc||im.src||'';" +
        "if(!s||s.indexOf('data:image/svg')===0)continue;" +
        "var r=im.getBoundingClientRect();if(r.width<8||r.height<8)continue;" +
        "found++;if(!im.complete||(im.naturalWidth||0)===0)loading++;}" +
        "if(found===0)return 'none|0';return (loading>0?'uploading|':'ready|')+found;})();";

    private static string FetchScript(string src) =>
        "(function(){var SRC=" + J(src) + ";" +
        "fetch(SRC).then(function(r){return r.arrayBuffer();}).then(function(buf){var b=new Uint8Array(buf);var bin='';var c=0x8000;" +
        "for(var i=0;i<b.length;i+=c){bin+=String.fromCharCode.apply(null,b.subarray(i,i+c));}" +
        "window.chrome.webview.postMessage(JSON.stringify({type:'image',b64:btoa(bin)}));})" +
        ".catch(function(e){window.chrome.webview.postMessage(JSON.stringify({type:'error',message:String(e)}));});return 'fetching';})();";

    // ExecuteScriptAsync returns a JSON-encoded value; decode string results.
    private static string Json(string result)
    {
        try { return JsonSerializer.Deserialize<string>(result) ?? ""; }
        catch { return ""; }
    }

    private static readonly Random _rng = new();

    // ---- ui plumbing ---------------------------------------------------------
    private void SetBusy(bool busy)
    {
        BtnGenerate.IsEnabled = !busy;
        BtnScan.IsEnabled = !busy;
        BtnReload.IsEnabled = !busy;
        BtnStop.IsEnabled = busy;
        // Tabs stay live while busy so the worklist can be read during a run.
        // Scope was fixed when Generate was pressed, so changing tabs mid-run
        // cannot redirect it.
    }

    private void Log(string msg)
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.Invoke(() => Log(msg)); return; }
        LogBox.AppendText(msg + "\n");
        LogBox.ScrollToEnd();
    }

    // ==== publishing =========================================================
    //
    // Local disk is where a station counts as done; the CDN is where it counts
    // as live. These keep the two in step.

    /// <summary>Expand %USERPROFILE% and friends in a configured path.</summary>
    private static string ExpandPath(string p) =>
        Environment.ExpandEnvironmentVariables(p ?? "").Trim().Trim('"');

    /// <summary>
    /// Run a console process to completion and hand back what it said.
    /// stdout and stderr are both captured: scp reports progress on one and
    /// failures on the other, and a silent failure is the one thing this must
    /// not produce.
    /// </summary>
    private static async Task<(int Code, string Out, string Err)> Run(
        string exe, string args, CancellationToken ct)
    {
        var psi = new System.Diagnostics.ProcessStartInfo(exe, args)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        using var p = new System.Diagnostics.Process { StartInfo = psi };
        p.Start();
        var so = p.StandardOutput.ReadToEndAsync();
        var se = p.StandardError.ReadToEndAsync();
        await p.WaitForExitAsync(ct);
        return (p.ExitCode, (await so).Trim(), (await se).Trim());
    }

    private string SshArgs => $"-i \"{ExpandPath(_publishKey)}\" -o BatchMode=yes "
                            + "-o StrictHostKeyChecking=accept-new -o ConnectTimeout=20";

    /// <summary>
    /// Make sure the destination folder exists. Once per session, or again
    /// after the folder is changed in Settings.
    /// </summary>
    private async Task<bool> EnsureRemoteDir(CancellationToken ct)
    {
        if (_remoteDirReady) return true;
        var (code, _, err) = await Run("ssh",
            $"{SshArgs} {_publishHost} \"mkdir -p '{_publishDir}'\"", ct);
        if (code != 0)
        {
            Log($"  ! Could not reach {_publishHost}: {(err.Length > 0 ? err : "exit " + code)}");
            Log("    Publishing is off for the rest of this run. Fix it in Settings and press Publish.");
            _publishEnabled = false;
            Dispatcher.Invoke(() => ChkPublish.IsChecked = false);
            return false;
        }
        _remoteDirReady = true;
        return true;
    }

    /// <summary>Copy one finished image to the CDN.</summary>
    private async Task<bool> PublishOne(string localPath, string slug, CancellationToken ct)
    {
        if (!await EnsureRemoteDir(ct)) return false;
        var name = Path.GetFileName(localPath);
        var (code, _, err) = await Run("scp",
            $"{SshArgs} \"{localPath}\" {_publishHost}:{_publishDir}/{name}", ct);
        if (code != 0)
        {
            Log($"  ! Publish failed for {name}: {(err.Length > 0 ? err : "exit " + code)}");
            return false;
        }
        Log($"  Published → {_publicBase}/{name}");
        return true;
    }

    /// <summary>
    /// Push everything already on disk, for the images rendered before
    /// publishing was switched on and for retrying anything that failed.
    /// The sidecar manifest rides along so the CDN carries its own provenance.
    /// </summary>
    private async void BtnPublishAll_Click(object sender, RoutedEventArgs e)
    {
        ReadRootsFromUi();
        if (!Directory.Exists(_imagesRoot)) { Log("No images folder yet: " + _imagesRoot); return; }

        var files = Directory.GetFiles(_imagesRoot, "*" + WebpExt);
        if (files.Length == 0) { Log("No .webp images to publish in " + _imagesRoot); return; }

        var btn = sender as System.Windows.Controls.Button;
        if (btn != null) btn.IsEnabled = false;
        try
        {
            _remoteDirReady = false;    // re-check the far end on an explicit push
            _publishEnabled = true;
            Log($"Publishing {files.Length} image(s) to {_publishHost}:{_publishDir} ...");

            int ok = 0, failed = 0;
            foreach (var f in files)
            {
                if (await PublishOne(f, Path.GetFileNameWithoutExtension(f), CancellationToken.None)) ok++;
                else { failed++; if (!_publishEnabled) break; }
            }

            var manifest = Path.Combine(_imagesRoot, ManifestName);
            if (File.Exists(manifest) && _publishEnabled)
                await PublishOne(manifest, "manifest", CancellationToken.None);

            Log($"Publish finished: {ok} uploaded"
                + (failed > 0 ? $", {failed} failed" : "") + ".");
        }
        finally
        {
            if (btn != null) btn.IsEnabled = true;
        }
    }
}
