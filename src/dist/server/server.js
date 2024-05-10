"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createANewPlayer = exports.getEntryFee = exports.Table = exports.TableTypesDict = exports.resetTable = exports.unirest = void 0;
const Player_1 = require("./Entities/Player");
const version_1 = require("./version");
const TableGameRoom_1 = require("./Entities/TableGameRoom");
const axios_1 = require("axios");
const Utils_1 = require("./Entities/Utils");
const apiroutes_1 = require("./apiroutes");
const logUtils_1 = require("./Entities/logUtils");
const apicalls_1 = require("./apicalls");
const pm2Handler_1 = require("./pm2Handler");
exports.unirest = require('unirest');
var cors = require('cors');
console.log(version_1.LIB_VERSION);
//if (process.env.LOCAL == "true")
require('dotenv').config();
var ip = require("ip");
const serverAddress = ip.address();
const uWS = require('uWebSockets.js');
//initialize a simple http server
const v8 = require('v8');
const fs = require('fs');
// import winston = require('winston');
// import 'winston-mongodb';
// import { MongoDBConnectionOptions } from 'winston-mongodb';
// export const DBURL = process.env.DB_URI;
// const dbOptions : MongoDBConnectionOptions = {
//     db : DBURL ? DBURL : "",
//     dbName : "rummyWinston",
//     level : "info",
//     // collection : "playerLogs",
//     // capped : true,
//     // storeHost : true,
// };
// export function getDBOptions(playerId : string) : MongoDBConnectionOptions
// {
//     return {
//         db : DBURL ? DBURL : "",
//         dbName : "rummyWinston",
//         level : "info",
//         collection : playerId+"Logs",
//         // capped : true,
//         // storeHost : true,
//     };
// }
// export const PlayerLogger = winston.createLogger({
//     level: 'info',
//     format: winston.format.json(),
//     defaultMeta: { service: 'user-service'},
//     transports: [
//         new winston.transports.File({ filename: 'playerLogsError.log', level: 'error' }),
//         new winston.transports.File({ filename: 'playerLogsCombined.log', level : 'info' }),
//         new winston.transports.MongoDB(dbOptions)
//     ],
// });
// if (process.env.NODE_ENV !== 'production')
// {
//     PlayerLogger.add(new winston.transports.Console({
//         format: winston.format.simple(),
//     }));
// }
axios_1.default.defaults.headers.post['x-auth-key'] = process.env.APITOKEN; // for POST requests
axios_1.default.defaults.headers.get['x-auth-key'] = process.env.APITOKEN; // for POST requests
const listOfActiveSockets = [];
const app = uWS.App().ws('/*', {
    /* Options */
    compression: uWS.SHARED_COMPRESSOR,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 30,
    /* Handlers */
    open: (ws) => {
        ws.isReady = false;
        ws.isConnectionAlive = true; //Making Connection alive
        ws.isAlive = true; //Making Connection alive
        if (listOfActiveSockets.indexOf(ws) == -1)
            listOfActiveSockets.push(ws);
        console.log("Socket Connection Open");
    },
    message: (ws, msg, isBinary) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        /* Ok is false if backpressure was built up, wait for drain */
        let message = { t: null };
        try {
            message = JSON.parse(Buffer.from(msg).toString());
        }
        catch (_k) {
            console.log("Could not parse msg " + msg);
        }
        if (message.t == "connect") {
            console.log(" =============================");
            createANewPlayer(ws, message.tableGameId, message.gid, message.entryFee, message.pName, message.pImage);
        }
        // else if (message.t == "reconnect")
        // {
        //     console.log("Reconnect Message Recieved " + message.plId + " " + message.tableId);
        //     if(GameRoomsDict[message.tableId])
        //     {
        //         if(GameRoomsDict[message.tableId].checkReconnectAvailability(message.plId))
        //         {
        //             GameRoomsDict[message.tableId].reconnectDroppedPlayer(message.plId, ws);
        //         } else
        //         {
        //             ws.send(JSON.stringify({t : "reconnectAgain"}));
        //             // ws.end(0, "Table does not exist!\nGet Back");
        //         }
        //     } else
        // {
        //     // console.log("Table id not found!");
        //     ws.send(JSON.stringify({t : "error", msg : "Table does not exist!\nGet Back"}));
        //     // ws.end(0, "Table does not exist!\nGet Back");
        // }
        // if()
        // should be in removedlist of the table sent by player and player-id and roomnetId
        //if not then return ....  dialog show game not found , exit to app
        // if yes --> recconect in tablergameroom.ts
        // }
        else if (message.t == "clickedLeave") {
            console.log("Clicked Leave");
            if (ws.player) {
                if (ws.player.gRoom)
                    (_a = ws.player.gRoom) === null || _a === void 0 ? void 0 : _a.handlePlayerClickLeaver(ws.player);
                else
                    console.log("Cant leave, Player is on table");
            }
            else {
                ws.close();
            }
        }
        else if (message.t == Utils_1.MSGTYPE.CARDPICKCLICKMSG) {
            console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message));
            if (ws.player.gRoom)
                (_b = ws.player.gRoom) === null || _b === void 0 ? void 0 : _b.handleCardPicked(ws.player, message.type, message);
            else
                console.log("Cant do dice roll player is not added to any room!");
            //    }
            //pick card
            //drop card
            //declare
            //drop
            // else if (message.t == "cardPickClickMsg") {
            //     //  console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message))
            //     if (ws.player.gRoom)
            //         ws.player.gRoom?.handleCardPicked(ws.player);
            //     else
            //         console.log("Cant pick card as pl is not added to any room!")
        }
        else if (message.t == "cardSeqCheckMsg") {
            //  console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message))
            if (ws.player.gRoom)
                (_c = ws.player.gRoom) === null || _c === void 0 ? void 0 : _c.handleCardsCheck(ws.player, message.cards);
            else
                console.log("Cant pick card as pl is not added to any room!");
        }
        else if (message.t == "cardDiscMsg") {
            console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message));
            if (ws.player.gRoom)
                (_d = ws.player.gRoom) === null || _d === void 0 ? void 0 : _d.handleCardDiscard(ws.player, message.card, message.cards, false);
            else
                console.log("Cant discard card as pl is not added to any room!");
        }
        else if (message.t == "finishGameMsg") {
            console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message));
            if (ws.player.gRoom)
                (_e = ws.player.gRoom) === null || _e === void 0 ? void 0 : _e.handleCardDiscard(ws.player, message.card, message.cards, true);
            else
                console.log("Cant do dice roll player is not added to any room!");
        }
        else if (message.t == "declareMsg") {
            console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message));
            if (ws.player.gRoom)
                (_f = ws.player.gRoom) === null || _f === void 0 ? void 0 : _f.handleDeclare(ws.player, message.cards);
            else
                console.log("Cant do dice roll player is not added to any room!");
        }
        else if (message.t == "submitMsg") {
            console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message));
            if (ws.player.gRoom)
                (_g = ws.player.gRoom) === null || _g === void 0 ? void 0 : _g.handleSubmit(ws.player, message.cards);
            else
                console.log("Cant do dice roll player is not added to any room!");
        }
        else if (message.t == "dropGame") {
            console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message));
            if (ws.player.gRoom)
                (_h = ws.player.gRoom) === null || _h === void 0 ? void 0 : _h.handleDroppedGame(ws.player, message.cards);
            else
                console.log("Can't drop game, Player is not added to any room!");
        }
        // else if (message.t == "pDiceRoll") {
        //     //  console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message))
        //     if (ws.player.gRoom)
        //         ws.player.gRoom?.handleDiceRoll(ws.player);
        //     else
        //         console.log("Cant do dice roll player is not added to any room!")
        // }
        // else if (message.t == "pTokenSelect") {
        //     //   console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message))
        //     if (ws.player.gRoom)
        //         ws.player.gRoom?.handleTokenMove(ws.player, message.token);
        //     else
        //         console.log("Cant do dice roll player is not added to any room!")
        // }
        // else if (message.t == "autoRefill") {
        //     console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message))
        //     ws.player.gRoom?.callAutoRefill(ws.player.plRoomNetId)
        //     //create a player object
        //     //getPlayerData from Database
        // }
        else if (message.t == "ping") {
            // console.log(ws.player.plRoomNetId+ " - "+ JSON.stringify(message))
            ws.isAlive = true;
            ws.send(JSON.stringify({ t: "pong" }));
            //create a player object
            //getPlayerData from Database
        }
        else if (message.t == "switchGame") {
            if (ws.player) {
                if (ws.player.gRoom)
                    (_j = ws.player.gRoom) === null || _j === void 0 ? void 0 : _j.handleSwitchTable(ws.player);
                else
                    console.log("Can't Switch table, Player is not on table");
            }
            else {
                ws.close();
            }
        }
    },
    drain: (ws) => {
        console.log('WebSocket backpressure: ' + ws.getBufferedAmount());
    },
    close: (ws, code, message) => {
        console.log('WebSocket closed');
        if (ws.isConnectionAlive) {
            ws.isConnectionAlive = false; //Making Connection alive
            console.log("Open Socket Connection Closed");
        }
        if (listOfActiveSockets.indexOf(ws) != -1) {
            listOfActiveSockets.splice(listOfActiveSockets.indexOf(ws), 1);
        }
        playerLeftRemoveFromGame(ws);
    }
}).any('/*', (res, req) => {
    res.writeHeader('Access-Control-Allow-Origin', '*').writeHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET').end("Hello " + version_1.LIB_VERSION);
}).listen(parseInt(process.env.SERVER_PORT || "8080"), (token) => {
    if (token) {
        // console.log("Server started at " + token.address + ":" + token.port);s
        console.log('Listening to port ' + parseInt(process.env.SERVER_PORT || "8080"));
    }
    else {
        console.log('Failed to listen to port ' + parseInt(process.env.SERVER_PORT || "8080"));
    }
});
// export interface ExtWebSocket extends WebSocket {
//     gRoom: TableGameRoom;
//     isAlive: boolean;
//     uniqueId: number;
//     player: Player;
// }
// export async function createANewPlayer(extWs: any, tableId: string, playerId: string, playerBal: number, pName: string, pImage: string) {
//     let newP: Player = new Player(extWs, tableId, playerId+"", pName, pImage);
//     extWs.player = newP;
//     Table.addPlayerToRoom(newP, playerBal);
//         console.log("Player addPlayerToRoom end")
//         extWs.isReady = true;
//     //add player to table
// }
function resetTable() {
    // Table   = new TableGameRoom();
    // console.log("Table Reset")
    setTimeout(() => {
        (0, pm2Handler_1.deleteProcess)();
    }, 6000);
}
exports.resetTable = resetTable;
function playerLeftRemoveFromGame(extWs) {
    var _a;
    // console.log("extWs============")
    // console.log(extWs)
    try {
        if (extWs == null || extWs.player == null) {
            console.log('Player that left undefined');
            return;
        }
        console.log("Player Left Room " + extWs.player.playerID);
        if (extWs.player.gRoom)
            (_a = extWs.player.gRoom) === null || _a === void 0 ? void 0 : _a.onSocketClose(extWs.player);
    }
    catch (error) {
        (0, logUtils_1.LogErrorToDB)({
            functionName: logUtils_1.FunctionLogNames.ON_PLAYER_WS_DISCONNECT,
            reason: 'Removing player from server on ws disconnection',
            properties: {},
            time: new Date(),
            servId: process.env.SERVERID,
            errorCode: Utils_1.ErrorCode.NULL
        });
    }
    // if(extWs.player)
    //  callPlayerLeftTableAPI("11",extWs.player.playerID, extWs.player.tableGameID)
}
// console.log(wss.clients.size)
// }, 1000);
// let nextMiniGame: number = 0;
setInterval(() => {
    // console.log("Checking Connections" + listOfActiveSockets.length);
    listOfActiveSockets.forEach((ws) => {
        if (ws.isReady) {
            // console.log("Checking Active Conenction of " + ws.player.plRoomNetId);
            if (ws.isAlive) {
                ws.isAlive = false;
            }
            else {
                //Disconnect
                console.log('Player Disconnected, WebSocket closing for ' + ws.player.plRoomNetId);
                ws.close();
                // playerLeftRemoveFromGame(ws)
            }
        }
    });
    console.log(new Date());
}, 5000);
(0, apicalls_1.callHeartBeatAPI)();
setInterval(() => {
    (0, apicalls_1.callHeartBeatAPI)();
}, 4000);
// setInterval(() => {
//     console.log("Creating Heap Snapshot");
//     createHeapSnapshot(); 
// }, 1000 * 10 * 60)
// function createHeapSnapshot()
// {
//     const snapshotStream = v8.getHeapSnapshot();
//     const fileName = `./heapdump-${Date.now()}.heapsnapshot`;
//     const fileStream = fs.createWriteStream(fileName);
//     snapshotStream.pipe(fileStream);
// }
const config = {
    serverId: -1,
    //  socketCnt: wss.clients.size
};
app.get('/getLiveGames', (res, req) => {
    /* It does Http as well */
    res.writeStatus('200 OK').writeHeader('Access-Control-Allow-Origin', '*').writeHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET').end(JSON.stringify((0, apiroutes_1.getLiveTables)()));
});
app.get('/stopRestartingGames', (res, req) => {
    /* It does Http as well */
    (0, apiroutes_1.stopRestartingGames)();
    res.writeStatus('200 OK').writeHeader('Access-Control-Allow-Origin', '*').writeHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET').end();
});
// app.post('/kickPlayer', removePlayerFromRoom);
//Rest API
// let router = express.Router();
// //route to handle user registration
// // parse requests of content-type - application/x-www-form-urlencoded
// app.use(bodyParser.urlencoded({ extended: true }));
// app.use(bodyParser.json());
// app.use(cors())
// app.get('/test', function (req, res, next) {
//     // Handle the get for this route
//     res.json("true");
// });
// app.use('/api', router);
// //start our server
// server.listen(4400, () => {
//     console.log(`Server started on port ${serverAddress} :)`);
// });
// export interface ExtWebSocket extends WebSocket {
//     gRoom: TableGameRoom;
//     isAlive: boolean;
//     uniqueId: number;
//     player: Player;
// }
// export var GameRoomsDict: { [id: string]: TableGameRoom; } = {};
exports.TableTypesDict = {};
let GameRoomIdCntr = 0;
let socketIdCntr = 0;
(0, apicalls_1.callGetTableTypesAPI)(Utils_1.GamesappGameId).then((data) => {
    console.log(exports.TableTypesDict);
    exports.Table = new TableGameRoom_1.TableGameRoom(Utils_1.TableTypeId);
    setInterval(() => {
        (0, apicalls_1.callHeartBeatAPI)();
        // console.log(new Date());
    }, 999);
});
function getEntryFee() {
    return exports.TableTypesDict[Utils_1.TableTypeId].maxEntryFee;
}
exports.getEntryFee = getEntryFee;
function createANewPlayer(extWs, tableId, playerId, playerBal, pName, pImage) {
    return __awaiter(this, void 0, void 0, function* () {
        let newP = new Player_1.Player(extWs, tableId, playerId + "", pName, pImage);
        extWs.player = newP;
        exports.Table.addPlayerToRoom(newP, playerBal);
        console.log("Player addPlayerToRoom end");
        extWs.isReady = true;
        //add player to table
    });
}
exports.createANewPlayer = createANewPlayer;
// setTimeout(()=> {
//     resetTable();
// }, 30 * 1000);
//# sourceMappingURL=server.js.map