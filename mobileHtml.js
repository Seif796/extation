// Mobile Web Controller UI Loader
const fs = require('fs');
const path = require('path');

function getMobileHtml(ip, port, defaultPin) {
  try {
    const filePath = path.join(__dirname, 'mobile.html');
    let html = fs.readFileSync(filePath, 'utf8');
    html = html.replace('{{DEFAULT_PIN}}', defaultPin || '');
    return html;
  } catch (err) {
    console.error('Error loading mobile.html:', err);
    return `<!DOCTYPE html><html><body><h3>Da7e AI Controller</h3><p>PIN: ${defaultPin}</p></body></html>`;
  }
}

module.exports = {
  getMobileHtml
};
