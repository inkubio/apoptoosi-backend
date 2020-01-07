require('dotenv').config();
const express = require('express');

const app = express();

app.get('/', (req, res) => {
   return res.send("TEST")
});

app.listen(process.env.PORT, () => {
   console.log(`App listening on port ${process.env.PORT}!`)
});