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
    'firstname VARCHAR(50) NOT NULL,' +
    'lastname VARCHAR(50) NOT NULL,' +
    'email VARCHAR(255) NOT NULL,' +
    'diet TEXT,' +
    'alcohol BIT(1) DEFAULT 0,' +
    'tableGroup TEXT,' +
    'avec VARCHAR(100),' +
    'organisation VARCHAR(255),' +
    'gift BIT(1) DEFAULT 0,' +
    'invited BIT(1) DEFAULT 0,' +
    'alumni BIT(1) DEFAULT 0,' +
    'sillis BIT(1) DEFAULT 0,' +
    'timestamp TIMESTAMP DEFAULT NOW(),' +
    'PRIMARY KEY(id)' +
    ') CHARACTER SET utf8;');

let transporter = nodemailer.createTransport({
   host: process.env.MAIL_SERVER,
   port: process.env.MAIL_PORT,
   secure: process.env.SECURE_MAIL === "true" || false,
   auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASSWD
   }
});

const app = express();
const clients = {}

app.use(bodyParser.json());

app.use(function(req, res, next) {
   res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
   next();
});

app.post('/signup', (req, res) => {
   // TODO: Check proper values for all fields
   const data = req.body;
   let dataFormatted = {
      firstname: data.firstName,
      lastname: data.lastName,
      email: data.email,
      alcohol: 'yes' === data.alcohol,
      tableGroup: data.tableGroup,
      diet: data.diet,
      avec: data.avec,
      organisation: data.organisation,
      gift: 'yes' === data.gift,
      alumni: 'yes' === data.alumni,
      sillis: 'yes' === data.sillis,
      invited: data.invited
   };
   console.log(data);
   console.log(dataFormatted);
   connection.query('INSERT INTO participants SET ?', dataFormatted, (err, result) => {
      if(err) throw err;
      res.status(201).json(dataFormatted);
   });
   let text = data.language === 'fi' ?
       `Turhaa lätinää kaikesta
       
Ilmoittauduit seuraavin tiedoin:

Nimi: ${dataFormatted.firstname} ${dataFormatted.lastname}
Sähköposti: ${dataFormatted.email}
Erityisruokavaliot: ${dataFormatted.diet}
Alkoholia: ${dataFormatted.alcohol ? 'Kyllä' : 'Ei'}
Pöytäryhmä: ${dataFormatted.tableGroup}
Avec: ${dataFormatted.avec}
Edustamani taho: ${dataFormatted.organisation}
Jätän tervehdyksen: ${dataFormatted.gift ? 'Kyllä': 'Ei'}
Alumni: ${dataFormatted.alumni  ? 'Kyllä' : 'Ei'}
Sillis: ${dataFormatted.sillis  ? 'Kyllä' : 'Ei'}`
 :
 `Some useless chatter
      
You have registered with following information:

Name: ${dataFormatted.firstname} ${dataFormatted.lastname}
Email: ${dataFormatted.email}
Dietary Restrictions: ${dataFormatted.diet}
Alcohol: ${dataFormatted.alcohol ? 'Kyllä' : 'Ei'}
Table Group: ${dataFormatted.tableGroup}
Avec: ${dataFormatted.avec}
Represented Organisation: ${dataFormatted.organisation}
I shall leave a salute: ${dataFormatted.gift ? 'Kyllä': 'Ei'}
Alumni: ${dataFormatted.alumni  ? 'Kyllä' : 'Ei'}
Sillis: ${dataFormatted.sillis  ? 'Kyllä' : 'Ei'}`;


   transporter.sendMail({
      from: '"No reply" <no-reply@inkubio.fi>',
      to: data.email,
      subject: "Apoptoosi XVI Ilmoittautuminen",
      text: text,
   });
});

app.get('/spots', (req,res) => {
   connection.query('SELECT COUNT(*) AS count FROM participants', (err, value) => {
      if (err) throw err;
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
   if(process.env.NODE_ENV === 'development') {
      connection.query('SELECT * FROM participants', (err, rows) => {
         if(err) throw err;
         res.json(rows);
      });
   } else {
      res.status(401).send();
   }

});

app.get('/signup/enable', (req, res) => {
   const headers = {
      'Content-Type': 'text/event-stream',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache'
   };
   res.writeHead(200, headers);

   let untilGuests = new Date(2020, 1, 3, 2, 2, 30, 0).getTime() - Date.now();
   let untilOthers = new Date(2020,1, 19,12,0,0,0).getTime()- Date.now();
   let timeoutIDGuests = setTimeout(() => {
      res.write(`data: ${JSON.stringify({guest: true})}\n\n`);
      console.log("TEST");
   },untilGuests);
   let timeoutIDOthers = setTimeout(() => res.write(`data: ${JSON.stringify({others: true})}\n\n`),untilOthers);

   res.on('close', () => {
      console.log('client dropped me');
      clearTimeout(timeoutIDGuests);
      clearTimeout(timeoutIDOthers);
      res.end();
   });
});



app.listen(process.env.PORT, () => {
   console.log(`App listening on port ${process.env.PORT}!`)
});
