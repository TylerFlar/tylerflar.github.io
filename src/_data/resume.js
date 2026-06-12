// Homepage timeline data, computed at build time from the master resume
// library (_resumes/data/master.yaml + website.yaml) so the website can
// never drift from the resumes. See _resumes/_lib/render-web.js.
module.exports = require("../../_resumes/_lib/render-web.js").render();
