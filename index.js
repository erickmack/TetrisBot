var Discord = require("discord.io");
var logger = require("winston");
var auth = require("./auth.json");
var request = require("request");
var apiKey = require("./apiKey.json")

var admin = require("firebase-admin");
var serviceAccount = require("./firebaseToken.json");

// Initialize firebase

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://match-bot-7518c.firebaseio.com"
});

let db = admin.firestore();

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console(), {
  colorize: true
});
logger.level = "debug";
// Initialize Discord Bot

const http = require("http");

const hostname = "127.0.0.1";
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain");
  res.end("Hello World\n");
});

server.listen(PORT, () => {
  console.log(`Server running`);
});

var bot = new Discord.Client({
  token: auth.token,
  autorun: true
});
bot.on("ready", function(evt) {
  logger.info("Connected");
  logger.info("Logged in as: ");
  logger.info(bot.username + " - (" + bot.id + ")");
});
bot.on("message", function(user, userID, channelID, message, evt) {
  let roleObj = Object.values(bot.servers[evt.d.guild_id].roles).find(
    r => r.name == "Admin"
  );
  if (message.substring(0, 1) == "!") {
    var args = message.substring(1).split(" ");
    var cmd = args[0];
    var authorize = apiKey.token
    var key = apiKey.key
    args = args.splice(1);
    switch (cmd) {
      case "commands":
        bot.sendMessage({
          to: channelID,
          message:
            "List of commands: \n '**!create [tournamentName]**' - creates a new tournament \n '**!add [Player'sName] [seed(optional)]**' - adds a participant to a specific tournament \n '**!remove [playerName]**' - deletes a participant from a tournament unless it has started already \n '**!start**' - starts the tournament \n '**!end**' - ends the tournament (a winner must be declared) \n '**!reset**' - resets the tournament \n '**!matches**' - gets all the open matches in a tournament \n '**!players**' - gets all the participants in a tournament \n '**!report [matchID] [score(player1-player2)]**' - updates the score of a specific match \n '**!winner [matchID] [winnerID] [score]**' - Declares the winner of a match"
        });
        break;
      case "ping":
        bot.sendMessage({
          to: channelID,
          message: "Pong!"
        });
        break;
      case "create":
        function createTournament() {
          var name = message.substr(message.indexOf(" ") + 1);
          // var name = message.split(" ")[1];
          let url =
            name.replace(/\s/g, "") + Math.floor(Math.random() * 1234);
          var options = {
            method: "POST",
            url: "https://api.challonge.com/v1/tournaments.json",
            qs: {
              "tournament[name]": name,
              "tournament[url]": url
            },
            headers: {
              "cache-control": "no-cache",
              Connection: "keep-alive",
              "content-length": "",
              Host: "api.challonge.com",
              "Cache-Control": "no-cache",
              Accept: "*/*",
              Authorization: authorize   
            }
          };

          request(options, function(error, response, body) {
            if (error) throw new Error(error);
            let res = JSON.parse(body);
            if (body.indexOf("errors") == -1) {
              let docRef = db.collection('tournament').doc('id');

              let setID = docRef.set({
                ID: res.tournament.id
              });

              bot.sendMessage({
                to: channelID,
                message:
                  "Tournament created with ID:" +
                  res.tournament.id +
                  " url: " +
                  "challonge.com/" +
                  url
              });
            } else {
              let res = JSON.parse(body);
              bot.sendMessage({
                to: channelID,
                message: res.errors
              });
            }
          });
        }

        try {
          if (evt.d.member.roles.includes(roleObj.id)) {
          createTournament();
        }
      } catch(error){
        console.error(error)
      } 
        break;
      case "add":
        try {if (evt.d.member.roles.includes(roleObj.id)) {
          async function addParticipants() {
            let tournamentID;
            await db.collection('tournament').get()
            .then((snapshot) => {
              snapshot.forEach((doc) => {
                let data = doc.data()
                tournamentID = data.ID
              });
            })
            .catch((err) => {
              console.log('Error getting documents', err);
            });
            let name = message.split(" ")[1];
            let seed = message.split(" ")[2];
            var options = {
              method: "POST",
              url:
                "https://api.challonge.com/v1/tournaments/" +
                tournamentID +
                "/participants.json",
              qs: {
                "participant[name]": name,
                "participant[seed]": seed ? seed : 1
              },
              headers: {
                "cache-control": "no-cache",
                Connection: "keep-alive",
                "content-length": "",
                cookie: "__cfduid=db8b5d7601d0987d750f98fbdf7ac844c1556741043",
                Host: "api.challonge.com",
                "Cache-Control": "no-cache",
                Accept: "*/*",
                Authorization:
                  authorize
              }
            };

            request(options, function(error, response, body) {
              if (error) throw new Error(error);
              let res = JSON.parse(body);
              if (body.indexOf("errors") == -1) {
                let docRef = db.collection('players').doc(name);

                let setPlayers = docRef.set({
                  ID: res.participant.id
                });
                bot.sendMessage({
                  to: channelID,
                  message:
                    "Player **" +
                    name +
                    "** added, **ID:** " +
                    res.participant.id
                });
              } else {
                bot.sendMessage({
                  to: channelID,
                  message: res.errors
                });
              }
            });
          }
          addParticipants();
        } } catch(error){console.error(error)}
        break;
      case "remove":
        async function deleteParticipant() {
          let tournamentID;
          let playerName = message.split(' ')[1]
          await db.collection('tournament').get()
            .then((snapshot) => {
              snapshot.forEach((doc) => {
                let data = doc.data()
                tournamentID = data.ID
              });
            })
            .catch((err) => {
              console.log('Error getting documents', err);
            });
          let playerID;
          let reference = db.collection('players').doc(playerName)
          let getDoc = await reference.get()
          .then(doc => {
            if (!doc.exists) {
              bot.sendMessage({
                to: channelID,
                message: "No such participant found"
              })
            } else {
              let data = doc.data()
              playerID = data.ID
            }
          })
          .catch(err => {
            console.log('Error getting document', err);
          });
          let deleteDoc = db.collection('players').doc(playerName).delete();
          var options = {
            method: "DELETE",
            url: `https://api.challonge.com/v1/tournaments/${tournamentID}/participants/${playerID}.json`,
            qs: { api_key: key },
            headers: {
              "cache-control": "no-cache",
              Connection: "keep-alive",
              "content-length": "",
              cookie: "__cfduid=db8b5d7601d0987d750f98fbdf7ac844c1556741043",
              Host: "api.challonge.com",
              "Cache-Control": "no-cache",
              Accept: "*/*"
            }
          };

          request(options, function(error, response, body) {
            if (error) throw new Error(error);
            let res = JSON.parse(body);
            if (body.indexOf("errors") == -1) {
              bot.sendMessage({
                to: channelID,
                message: "Participant " + playerName + " has been removed"
              });
            } else {
              bot.sendMessage({
                to: channelID,
                message: res.errors
              });
            }
          });
        }
        try {if (evt.d.member.roles.includes(roleObj.id)) {
          deleteParticipant();
        }} catch(err){console.error(err)}
        break;
      case "start":
        try 
        {if (evt.d.member.roles.includes(roleObj.id)) {
          async function startTournament() {
            
            let tournamentID;
            await db.collection('tournament').get()
            .then((snapshot) => {
              snapshot.forEach((doc) => {
                let data = doc.data()
                tournamentID = data.ID
              });
            })
            .catch((err) => {
              console.log('Error getting documents', err);
            });
            var options = {
              method: "POST",
              url:
                "https://api.challonge.com/v1/tournaments/" +
                tournamentID +
                "/start.json",
              qs: { api_key: key },
              headers: {
                "cache-control": "no-cache",
                Connection: "keep-alive",
                "content-length": "",
                cookie: "__cfduid=db8b5d7601d0987d750f98fbdf7ac844c1556741043",
                Host: "api.challonge.com",
                "Postman-Token":
                  "fb9385f8-4fe9-4b40-9250-57d30e85b16f,58a88f5a-8b3f-4e41-9298-50e6ab8644f2",
                "Cache-Control": "no-cache",
                Accept: "*/*",
                "User-Agent": "PostmanRuntime/7.11.0"
              }
            };

            request(options, function(error, response, body) {
              if (error) throw new Error(error);
              let res = JSON.parse(body);
              if (body.indexOf("errors") == -1) {
                bot.sendMessage({
                  to: channelID,
                  message: "The tournament has started!"
                });
              } else {
                bot.sendMessage({
                  to: channelID,
                  message: res.errors
                });
              }
            });
          }
          startTournament();
        }} catch(err){console.error(err)}
        break;

      case "end":
        try {if (evt.d.member.roles.includes(roleObj.id)) {
          async function endTournament() {
            
            let tournamentID;
            await db.collection('tournament').get()
            .then((snapshot) => {
              snapshot.forEach((doc) => {
                let data = doc.data()
                tournamentID = data.ID
              });
            })
            .catch((err) => {
              console.log('Error getting documents', err);
            });
            var options = {
              method: "POST",
              url:
                "https://api.challonge.com/v1/tournaments/" +
                tournamentID +
                "/finalize.json",
              qs: { api_key: key },
              headers: {
                "cache-control": "no-cache",
                Connection: "keep-alive",
                "content-length": "",
                cookie: "__cfduid=db8b5d7601d0987d750f98fbdf7ac844c1556741043",
                Host: "api.challonge.com",
                "Cache-Control": "no-cache",
                Accept: "*/*"
              }
            };

            request(options, function(error, response, body) {
              if (error) throw new Error(error);
              let res = JSON.parse(body);
              if (body.indexOf("errors") == -1) {
                let deleteDoc = db.collection('tournament').doc('id').delete();
                function deleteCollection(db, collectionPath, batchSize) {
                  let collectionRef = db.collection(collectionPath);
                  let query = collectionRef.orderBy('__name__').limit(batchSize);
                
                  return new Promise((resolve, reject) => {
                    deleteQueryBatch(db, query, batchSize, resolve, reject);
                  });
                }
                
                function deleteQueryBatch(db, query, batchSize, resolve, reject) {
                  query.get()
                    .then((snapshot) => {
                      // When there are no documents left, we are done
                      if (snapshot.size == 0) {
                        return 0;
                      }
                
                      // Delete documents in a batch
                      let batch = db.batch();
                      snapshot.docs.forEach((doc) => {
                        batch.delete(doc.ref);
                      });
                
                      return batch.commit().then(() => {
                        return snapshot.size;
                      });
                    }).then((numDeleted) => {
                      if (numDeleted === 0) {
                        resolve();
                        return;
                      }
                
                      // Recurse on the next process tick, to avoid
                      // exploding the stack.
                      process.nextTick(() => {
                        deleteQueryBatch(db, query, batchSize, resolve, reject);
                      });
                    })
                    .catch(reject);
                }
                deleteCollection(db, 'players', 200)
                bot.sendMessage({
                  to: channelID,
                  message: "The tournament has ended"
                });
              } else {
                bot.sendMessage({
                  to: channelID,
                  message: res.errors
                });
              }
            });
          }
          endTournament();
        }} catch(err){console.error(err)}
        break;
      case "reset":
        async function resetTournament() {
          
          let tournamentID;
          await db.collection('tournament').get()
            .then((snapshot) => {
              snapshot.forEach((doc) => {
                let data = doc.data()
                tournamentID = data.ID
              });
            })
            .catch((err) => {
              console.log('Error getting documents', err);
            });
          var options = {
            method: "POST",
            url:
              "https://api.challonge.com/v1/tournaments/" +
              tournamentID +
              "/reset.json",
            qs: { api_key: key },
            headers: {
              "cache-control": "no-cache",
              Connection: "keep-alive",
              cookie: "__cfduid=db8b5d7601d0987d750f98fbdf7ac844c1556741043",
              Host: "api.challonge.com",
              "Cache-Control": "no-cache",
              Accept: "*/*"
            }
          };

          request(options, function(error, response, body) {
            if (error) throw new Error(error);
            let res = JSON.parse(body);
            if (body.indexOf("errors") == -1) {
              bot.sendMessage({
                to: channelID,
                message:
                  "The tournament has been reset, you can add/delete participants before starting the tournament again"
              });
            } else {
              bot.sendMessage({
                to: channelID,
                message: res.errors
              });
            }
          });
        }
        resetTournament()
        try {
          if (evt.d.member.roles.includes(roleObj.id)) {
          resetTournament();
        }
      } catch(err){console.error(err)}
        break;
      case "matches":
        async function getMatches() {
          async function nameRequest(id1, id2, match){
            let reference = db.collection('players');
            let name1;
            let name2;
            let players = reference.get()
              .then(snapshot => {
                snapshot.forEach(doc => {
                  let data = doc.data()
                  if(data.ID == id1){
                    name1 = doc.id
                  }
                });
              })
              .catch(err => {
                console.log('Error getting documents', err);
              });
            let players2 = reference.get()
              .then(snapshot => {
                snapshot.forEach(doc => {
                  let data = doc.data()
                  if(data.ID == id2){
                    name2 = doc.id
                  }
                });
              })
              .catch(err => {
                console.log('Error getting documents', err);
              });

              setTimeout(function(){
                bot.sendMessage({
                  to: channelID,
                  message: `***Match ID:*** ${
                    match
                  } ***Player's***:  ${name1} ***vs*** ${
                    name2
                  }`
                })
              }, 500)
          }
          let tournamentID;
          await db.collection('tournament').get()
            .then((snapshot) => {
              snapshot.forEach((doc) => {
                let data = doc.data()
                tournamentID = data.ID
              });
            })
            .catch((err) => {
              console.log('Error getting documents', err);
            });
          var options = {
            method: "GET",
            url:
              "https://api.challonge.com/v1/tournaments/" +
              tournamentID +
              "/matches.json",
            qs: {
              state: "open",
              api_key: key
            },
            headers: {
              "cache-control": "no-cache",
              Connection: "keep-alive",
              cookie: "__cfduid=db8b5d7601d0987d750f98fbdf7ac844c1556741043",
              Host: "api.challonge.com",
              "Cache-Control": "no-cache",
              Accept: "*/*"
            }
          };
          request(options, function(error, response, body) {
            let results = JSON.parse(body);
            async function sendMessages(i) {
              let match = results[i].match.id
              let player1 = results[i].match.player1_id
              let player2 = results[i].match.player2_id
              nameRequest(player1, player2, match);
            }
            if (body.indexOf("html") !== -1) {
              bot.sendMessage({
                to: channelID,
                message: "No open matches, Make sure the tournament has started"
              });
            } else if(results.length < 1){
              bot.sendMessage({
                to: channelID,
                message: "No open matches, Make sure the tournament has started"
              });
            } else {
              for (let i = 0; i < results.length; i++) {
                setTimeout(function() {
                  sendMessages(i)
                }, 1000 * i);
              }
            }
          });
        }
        getMatches();
        break;
      case "players":
        async function getParticipants() {
          
          let tournamentID;
          await db.collection('tournament').get()
            .then((snapshot) => {
              snapshot.forEach((doc) => {
                let data = doc.data()
                tournamentID = data.ID
              });
            })
            .catch((err) => {
              console.log('Error getting documents', err);
            });
          var options = {
            method: "GET",
            url:
              "https://api.challonge.com/v1/tournaments/" +
              tournamentID +
              "/participants.json",
            qs: { api_key: key },
            headers: {
              "cache-control": "no-cache",
              Connection: "keep-alive",
              cookie: "__cfduid=db8b5d7601d0987d750f98fbdf7ac844c1556741043",
              Host: "api.challonge.com",
              "Cache-Control": "no-cache",
              Accept: "*/*"
            }
          };

          request(options, function(error, response, body) {
            if (error) throw new Error(error);
            let res = JSON.parse(body);
            function sendMessages(i) {
              bot.sendMessage({
                to: channelID,
                message: `**${res[i].participant.name}**`,
                typing: true
              });
            }
            if (body.indexOf("errors") == -1) {
              bot.sendMessage({
                to: channelID,
                message: '***Players:***'
              })
              for (let i = 0; i < res.length; i++) {
                setTimeout(function() {
                  sendMessages(i);
                }, 1000 * i);
              }
            } else {
              bot.sendMessage({
                to: channelID,
                message: res.errors
              });
            }
          });
        }
        getParticipants();
        break;
      case "report":
        try {
          if (evt.d.member.roles.includes(roleObj.id)) {
          async function setScores() {
            
            let tournamentID;
            await db.collection('tournament').get()
            .then((snapshot) => {
              snapshot.forEach((doc) => {
                let data = doc.data()
                tournamentID = data.ID
              });
            })
            .catch((err) => {
              console.log('Error getting documents', err);
            });
            let matchID = message.split(" ")[1];
            let score = message.split(" ")[2];
            var options = {
              method: "PUT",
              url:
                "https://api.challonge.com/v1/tournaments/" +
                tournamentID +
                "/matches/" +
                matchID +
                ".json",
              qs: {
                "match[scores_csv]": score,
                api_key: key
              },
              headers: {
                "cache-control": "no-cache",
                Connection: "keep-alive",
                "content-length": "",
                cookie: "__cfduid=db8b5d7601d0987d750f98fbdf7ac844c1556741043",
                Host: "api.challonge.com",
                "Cache-Control": "no-cache",
                Accept: "*/*"
              }
            };

            request(options, function(error, response, body) {
              let mistake = JSON.parse(body);
              if (mistake.errors) {
                bot.sendMessage({
                  to: channelID,
                  message: mistake.errors
                });
              } else {
                bot.sendMessage({
                  to: channelID,
                  message: "Scores Updated successfully"
                });
              }
            });
          }
          setScores();
        }
      }  catch(err){console.error(err)}
        break;
      case "winner":
        try {
          if (evt.d.member.roles.includes(roleObj.id)) {
          async function setWinner() {
            let tournamentID;
            await db.collection('tournament').get()
            .then((snapshot) => {
              snapshot.forEach((doc) => {
                let data = doc.data()
                tournamentID = data.ID
              });
            })
            .catch((err) => {
              console.log('Error getting documents', err);
            });
            let matchID = message.split(" ")[1];
            let winnerName = message.split(" ")[2]
            let winnerID
            let reference = await db.collection('players').doc(winnerName);
            let getDoc = await reference.get()
              .then(doc => {
                if (!doc.exists) {
                  console.log('No such document!');
                } else {
                  let data = doc.data()
                  winnerID = data.ID
                }
              })
              .catch(err => {
                console.log('Error getting document', err);
              });
            let score = message.split(" ")[3];

            var options = { method: 'PUT',
            url: 'https://api.challonge.com/v1/tournaments/'+tournamentID+'/matches/'+matchID+'.json?match[scores_csv]='+score+'&match[winner_id]='+winnerID,
            headers: 
             { 'cache-control': 'no-cache',
               Connection: 'keep-alive',
               'content-length': '',
               cookie: '__cfduid=d592765a893adb2a2d35f906c25153bf11563208454',
               Host: 'api.challonge.com',
               'Cache-Control': 'no-cache',
               Accept: '*/*',
               Authorization: authorize } };
          
            request(options, function(error, response, body) {
              let mistake = JSON.parse(body);
              if (mistake.errors) {
                bot.sendMessage({
                  to: channelID,
                  message: mistake.errors
                });
              } else {
                bot.sendMessage({
                  to: channelID,
                  message:
                    "winner of the match: " +
                    winnerName +
                    " final score: " +
                    mistake.match.scores_csv
                });
              }
            });
          }
          setWinner();
        }
      } catch(err){console.log(err)}
        break;
    }
  }
});
