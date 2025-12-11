const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

// Main route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'okn-dashboard_best.html'));
});

app.listen(PORT, () => {
  console.log(`OKN Dashboard server running on port ${PORT}`);
});
