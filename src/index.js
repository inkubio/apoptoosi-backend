require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require("nodemailer");
const https = require('https');
const http = require('http');
const fs  = require('fs');
const cors = require('cors');
const { check, validationResult } = require('express-validator');
const mysql = require('mysql');
const auth = require('basic-auth');

const dbConfig = {
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
};

let connection;
function handleDisconnect() {
   connection = mysql.createConnection(dbConfig);  // Recreate the connection, since the old one cannot be reused.
   connection.connect( function onConnect(err) {   // The server is either down
      if (err) {                                  // or restarting (takes a while sometimes).
         console.log('error when connecting to db:', err);
         setTimeout(handleDisconnect, 10000);    // We introduce a delay before attempting to reconnect,
      }                                           // to avoid a hot loop, and to allow our node script to
      console.log("Connected");
   });                                             // process asynchronous requests in the meantime.
                                                   // If you're also serving http, display a 503 error.
   connection.on('error', function onError(err) {
      console.log('db error', err);
      if (err.code == 'PROTOCOL_CONNECTION_LOST') {   // Connection to the MySQL server is usually
         handleDisconnect();                         // lost due to either server restart, or a
      } else {                                        // connnection idle timeout (the wait_timeout
         throw err;                                  // server variable configures this)
      }
   });
}

handleDisconnect();

connection.query('CREATE TABLE IF NOT EXISTS participants(' +
    'id SMALLINT AUTO_INCREMENT NOT NULL,' +
    'firstname VARCHAR(50) NOT NULL,' +
    'lastname VARCHAR(50) NOT NULL,' +
    'email VARCHAR(255) NOT NULL,' +
    'diet TEXT,' +
    'alcohol BIT(1) DEFAULT 0,' +
    'tableGroup TEXT,' +
    'avec VARCHAR(100),' +
    'organisation VARCHAR(255),' +
    'gift BIT(1) NOT NULL DEFAULT 0,' +
    'invited BIT(1) NOT NULL DEFAULT 0,' +
    'alumni BIT(1) NOT NULL DEFAULT 0,' +
    'sillis BIT(1) NOT NULL DEFAULT 0,' +
    'timestamp TIMESTAMP DEFAULT NOW(),' +
    'PRIMARY KEY(id)' +
    ') CHARACTER SET utf8;');

let transporter = nodemailer.createTransport({
   host: process.env.MAIL_SERVER,
   port: process.env.MAIL_PORT,
   tls:{
      rejectUnauthorized: false
   }
});

const app = express();

app.use(express.static(__dirname + '/static', { dotfiles: 'allow' } ))

app.use(bodyParser.json());

app.use(cors());

app.post('/signup',[
   check('email').isEmail(),
   check('firstName').notEmpty().isString(),
   check('lastName').notEmpty().isString(),
   check('alcohol').notEmpty().isString(),
   check('tableGroup').optional({nullable: true}).isString(),
   check('diet').optional({nullable: true}).isString(),
   check('avec').optional({nullable: true}).isString(),
   check('organisation').optional({nullable: true}).isString(),
   check('alumni').optional({nullable: true}).isString(),
   check('gift').optional({nullable: true}).isString(),
   check('sillis').optional({nullable: true}).isString(),
   check('invited').optional({nullable: true}).isBoolean()], (req, res) => {
   const errors = validationResult(req);
   if (!errors.isEmpty()) {
      console.log("Validation error");
      console.log(req.body);
      return res.status(422).json({ errors: errors.array() });
   }
   if(Date.now() < Date.parse(process.env.ENABLE_GUEST) || Date.now() > Date.parse(process.env.DISABLE_SIGN_UP)) {
      return res.status(405).send();
   }
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
      invited: data.invited || false,
   };
   connection.query('INSERT INTO participants SET ?', dataFormatted, (err, result) => {
      if(err) {
         console.log("Database insert error");
         console.log(err);
         return res.status(401).send();
      }
      res.status(201).json(dataFormatted);
   });
   let text = data.language === 'fi' ?
       `Kiitos ilmoittautumisesta
       
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
       `Thank you for signing up
      
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
      subject: data.language === 'fi' ? "Apoptoosi XVI Ilmoittautuminen" : "Apoptoosi XVI Sign Up",
      text: text,
   },(err, info) => {
      console.log(info);
   });
});

app.get('/spots', (req,res) => {
   connection.query('SELECT COUNT(*) AS count FROM participants', (err, value) => {
      if (err) {
         return res.status(500).send();
      }
      res.json({
         maxSpots: 150,
         usedSpots: value[0].count
      });
   });
});

app.get('/participants', (req, res) => {
   connection.query('SELECT id,firstname,lastname,tableGroup FROM participants', (err, rows) => {
      if (err) {
         return res.status(500).send();
      }
      res.json(rows);
   });
});

app.get('/all', (req,res) => {
   let user = auth(req);
   if (!user || !(user.name === process.env.DATA_USER && user.pass === process.env.DATA_PASSWD)) {
      res.statusCode = 401;
      res.setHeader('WWW-Authenticate', 'Basic realm="participants"');
      res.end('Access denied');
   } else {
      connection.query('SELECT * FROM participants', (err, rows) => {
         if(err) {
            return res.status(500).send();
         } else {
            return res.json(rows);
         }
      });
   }
});

app.get('/signup/enable', (req, res) => {
   const headers = {
      'Content-Type': 'text/event-stream',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache'
   };
   res.writeHead(200, headers);

   let timeoutIDGuests;
   let timeoutIDOthers;
   if(Date.now() < Date.parse(process.env.DISABLE_SIGN_UP)) {
      let untilGuests = Date.parse(process.env.ENABLE_GUEST) - Date.now();
      let untilOthers = Date.parse(process.env.ENABLE_OTHER) - Date.now();
      timeoutIDGuests = setTimeout(() => {
         res.write(`data: ${JSON.stringify({guest: true})}\n\n`);
      },untilGuests);
      timeoutIDOthers = setTimeout(() => res.write(`data: ${JSON.stringify({others: true})}\n\n`),untilOthers);
   }

   res.on('close', () => {
      clearTimeout(timeoutIDGuests);
      clearTimeout(timeoutIDOthers);
      res.end();
   });
});



if (process.env.USE_HTTPS === 'True') {
   https.createServer({
      key: fs.readFileSync(__dirname + '/privkey.pem'),
      cert: fs.readFileSync(__dirname + '/fullchain.pem'),
      ca: fs.readFileSync(__dirname + '/chain.pem')
   }, app).listen(process.env.PORT, () => {
      console.log('Listening...')
   });
} else {
   http.createServer(app).listen(process.env.PORT, (app) => {
      console.log('Listening...')
   });
}
