/* Builds the 1200x630 share card by composing an HTML page with the Jubilee
   logo inlined as a data URI and screenshotting it with the project's own
   headless-Chrome tool. No new dependency, and the card is regenerable from
   this script rather than being a binary somebody has to redraw by hand. */
const fs = require('fs');
const path = require('path');

const ROOT = 'W:/kJubilee.com';
const OUT_HTML = process.argv[2];
const logo = fs.readFileSync(path.join(ROOT, 'public/images/JubileeLogo.png')).toString('base64');

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:1200px;height:630px;overflow:hidden}
  body{
    background:#05070c;
    font-family:"Segoe UI",Tahoma,Geneva,Verdana,-apple-system,BlinkMacSystemFont,sans-serif;
    color:#f3f2ee;
    display:flex;align-items:center;gap:64px;
    padding:0 84px;
    position:relative;
  }
  /* A single cool glow behind the disc rather than a gradient across the whole
     card: the thumbnail is often rendered at 200px wide in a message bubble,
     where a busy background turns to mud and a lit subject still reads. */
  .glow{
    position:absolute;left:-60px;top:50%;transform:translateY(-50%);
    width:760px;height:760px;border-radius:50%;
    background:radial-gradient(circle, rgba(61,165,255,.30) 0%, rgba(61,165,255,.10) 45%, transparent 70%);
  }
  .disc{
    position:relative;flex:0 0 auto;width:330px;height:330px;border-radius:50%;
    overflow:hidden;border:5px solid rgba(61,165,255,.55);
    box-shadow:0 30px 90px rgba(0,0,0,.75);
  }
  .disc img{width:100%;height:100%;object-fit:cover;display:block}
  .txt{position:relative;min-width:0}
  .eyebrow{
    font-size:23px;font-weight:700;letter-spacing:.34em;text-transform:uppercase;
    color:#3DA5FF;margin-bottom:20px;
  }
  .name{font-size:82px;font-weight:600;letter-spacing:.01em;line-height:1;white-space:nowrap}
  .name .k{color:#fff}
  .name .j{color:#3DA5FF}
  .name .dot{color:#f3f2ee}
  .freq{
    margin-top:26px;font-size:40px;font-weight:800;letter-spacing:-.01em;color:#fff;
    white-space:nowrap;
  }
  .freq .hm{color:#8c8d9c;font-weight:700;font-size:29px;letter-spacing:.06em;margin-right:12px}
  .tag{margin-top:20px;font-size:26px;color:#c9cad4;letter-spacing:.02em}
  /* The azure edge the player bar carries, so the card and the page it opens
     are recognisably the same product. */
  .edge{position:absolute;left:0;right:0;bottom:0;height:9px;background:#3DA5FF}
</style></head><body>
  <div class="glow"></div>
  <div class="disc"><img src="data:image/png;base64,${logo}" alt=""></div>
  <div class="txt">
    <div class="eyebrow">The Radio Dial</div>
    <div class="name"><span class="k">k</span><span class="j">Jubilee</span><span class="dot">.com</span></div>
    <div class="freq"><span class="hm">HM</span>308.70 &middot; Year of Jubilee</div>
    <div class="tag">Continuous worship and teaching, day and night.</div>
  </div>
  <div class="edge"></div>
</body></html>`;

fs.writeFileSync(OUT_HTML, html);
console.log('wrote ' + OUT_HTML);
