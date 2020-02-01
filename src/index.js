require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require("nodemailer");
const mysql = require('mysql');

const connection = mysql.createConnection({
   host: process.env.HOST,
   user: process.env.DB_USER,
   password: process.env.DB_PASSWD,
   database: process.env.DB,
   port: process.env.DB_PORT || 3306,
   typeCast: function castField( field, useDefaultTypeCasting ) {

      // We only want to cast bit fields that have a single-bit in them. If the field
      // has more than one bit, then we cannot assume it is supposed to be a Boolean.
      if ( field !== null && ( field.type === "BIT" ) && ( field.length === 1 ) ) {

         var bytes = field.buffer();

         // A Buffer in Node represents a collection of 8-bit unsigned integers.
         // Therefore, our single "bit field" comes back as the bits '0000 0001',
         // which is equivalent to the number 1.
         return( bytes[ 0 ] === 1 );

      }

      return( useDefaultTypeCasting() );

   }
});
connection.connect((err) => {
   if (err) throw err;
   console.log('Connected!');
});
connection.query('CREATE TABLE IF NOT EXISTS participants(' +
    'id TINYINT AUTO_INCREMENT NOT NULL,' +
    'firstname VARCHAR(20) NOT NULL,' +
    'lastname VARCHAR(40) NOT NULL,' +
    'email TEXT NOT NULL,' +
    'diet TEXT,' +
    'alcohol BIT(1) DEFAULT 0,' +
    'tableGroup TEXT,' +
    'avec VARCHAR(60),' +
    'organisation TEXT,' +
    'gift BIT(1) DEFAULT 0,' +
    'invited BIT(1) DEFAULT 0,' +
    'alumni BIT(1) DEFAULT 0,' +
    'PRIMARY KEY(id)' +
    ') CHARACTER SET utf8;');

const app = express();

app.use(bodyParser.json());

app.use(function(req, res, next) {
   res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
   next();
});

app.post('/signup', (req, res) => {
   const data = req.body;
   let dataFormatted = {
      firstname: data.firstName,
      lastname: data.lastName,
      email: data.email,
      diet: data.diet,
      alcohol: 'yes' === data.alcohol,
      tableGroup: data.tableGroup,
      avec: data.avec
   };
   console.log(dataFormatted);
   connection.query('INSERT INTO participants SET ?', dataFormatted, (err, result) => {
      if(err) throw err;
      console.log(result);
      res.json(result);
   });
});

app.get('/spots', (req,res) => {
   connection.query('SELECT COUNT(*) AS count FROM participants', (err, value) => {
      if (err) throw err;
      console.log(value);
      res.json({
         maxSpots: 150,
         usedSpots: value[0].count
      });
   });
});

app.get('/participants', (req, res) => {
   connection.query('SELECT id,firstname,lastname,tableGroup FROM participants', (err, rows) => {
      if (err) throw err;

      res.json(rows);
   });
});

app.get('/all', (req,res) => {
   connection.query('SELECT * FROM participants', (err, rows) => {
      if(err) throw err;
      res.json(rows);
   });
});

app.listen(process.env.PORT, () => {
   console.log(`App listening on port ${process.env.PORT}!`)
});