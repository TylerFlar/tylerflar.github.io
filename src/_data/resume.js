// The homepage's data, computed at build time from the record and the CV's
// picks (_resumes/data/master.yaml and cv.yaml), in the order website.yaml
// gives, with the bio from profile.yaml and the interests row. The site and
// the CV can't drift apart, since both read the same files.
// See _resumes/_lib/render-web.js.
module.exports = require("../../_resumes/_lib/render-web.js").render();
