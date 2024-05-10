import * as express from 'express'; 
import * as http from 'http';
import * as WebSocket from 'ws';
import { Player } from './Entities/Player';
import e = require('express');
// import * as e from 'express';
import * as https from "https";
import bodyParser = require('body-parser');

import { LIB_VERSION } from './version';

// import * as bodyParser from 'body-parser';

import { convertToObject, couldStartTrivia } from 'typescript';
import { group } from 'console';
import { TableGameRoom } from './Entities/TableGameRoom';
import { FORMERR } from 'dns';
import axios from 'axios';
import { ErrorCode, GamesappGameId, MSGTYPE, TableTypeId } from './Entities/Utils';
import { getLiveTables, stopRestartingGames } from './apiroutes';
import { FunctionLogNames, LogErrorToDB } from './Entities/logUtils';
import { callGetTableTypesAPI, callHeartBeatAPI, DBCollectionNames, sendToAnalytics } from './apicalls';
import { deleteProcess } from './pm2Handler';
export var unirest = require('unirest');
var cors = require('cors')



console.log(LIB_VERSION);

//if (process.env.LOCAL == "true")
require('dotenv').config()

var ip = require("ip");
const serverAddress = ip.address()

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



axios.defaults.headers.post['x-auth-key'] = process.env.APITOKEN // for POST requests
axios.defaults.headers.get['x-auth-key'] = process.env.APITOKEN // for POST requests


const listOfActiveSockets: any[] = [];

const app = uWS.App().ws('/*', {
     /* Options */
    compression: uWS.SHARED_COMPRESSOR,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 30,
    /* Handlers */
    open: (ws: any) => {

        ws.isReady = false;
        ws.isConnectionAlive = true; //Making Connection alive
        ws.isAlive = true; //Making Connection alive

        if(listOfActiveSockets.indexOf(ws) == -1)
            listOfActiveSockets.push(ws);

        console.log("Socket Connection Open")
    },
    message: (ws: any, msg: any, isBinary: any) => {
        /* Ok is false if backpressure was built up, wait for drain */
        let message: any = { t: null }
        try {
            message = JSON.parse(Buffer.from(msg).toString())
        } catch {
            console.log("Could not parse msg " + msg)
        }

        if (message.t == "connect") {

           console.log(" =============================")


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
        else if(message.t =="clickedLeave"){
            console.log("Clicked Leave");

            if(ws.player)
            {
                if(ws.player.gRoom)
                    ws.player.gRoom?.handlePlayerClickLeaver(ws.player);
                else
                    console.log("Cant leave, Player is on table");

            } else
            {
                ws.close();
            }


        }
        else if (message.t == MSGTYPE.CARDPICKCLICKMSG) {
             console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message))

            if (ws.player.gRoom)
                ws.player.gRoom?.handleCardPicked(ws.player, message.type, message);
            else
                console.log("Cant do dice roll player is not added to any room!")

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


        } else if (message.t == "cardSeqCheckMsg") {
            //  console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message))

            if (ws.player.gRoom)
                ws.player.gRoom?.handleCardsCheck(ws.player, message.cards);
            else
                console.log("Cant pick card as pl is not added to any room!")

        } else if (message.t == "cardDiscMsg") {
              console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message))

            if (ws.player.gRoom)
                ws.player.gRoom?.handleCardDiscard(ws.player, message.card,message.cards, false);
            else
                console.log("Cant discard card as pl is not added to any room!")

        } else if (message.t == "finishGameMsg") {
             console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message))

            if (ws.player.gRoom)
                ws.player.gRoom?.handleCardDiscard(ws.player, message.card,message.cards, true);
            else
                console.log("Cant do dice roll player is not added to any room!")

        } else if (message.t == "declareMsg") {
              console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message))

            if (ws.player.gRoom)
                ws.player.gRoom?.handleDeclare(ws.player, message.cards);
            else
                console.log("Cant do dice roll player is not added to any room!")

        }
        else if (message.t == "submitMsg") {
              console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message))

            if (ws.player.gRoom)
                ws.player.gRoom?.handleSubmit(ws.player, message.cards);
            else
                console.log("Cant do dice roll player is not added to any room!")

        }

        else if (message.t == "dropGame") {
            console.log(ws.player.plRoomNetId + " - " + JSON.stringify(message))

          if (ws.player.gRoom)
              ws.player.gRoom?.handleDroppedGame(ws.player, message.cards);
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
            ws.isAlive = true
            ws.send(JSON.stringify({ t: "pong" }))

            //create a player object
            //getPlayerData from Database

        } else if (message.t == "switchGame")
        {
            if(ws.player)
            {
                if(ws.player.gRoom)
                    ws.player.gRoom?.handleSwitchTable(ws.player);
                else
                    console.log("Can't Switch table, Player is not on table");
            } else
            {
                ws.close();
            }
        }
    },
    drain: (ws: any) => {
        console.log('WebSocket backpressure: ' + ws.getBufferedAmount());
    },
    close: (ws: any, code: any, message: any) => {
   console.log('WebSocket closed');
        if(ws.isConnectionAlive)
        {
            ws.isConnectionAlive = false; //Making Connection alive
            console.log("Open Socket Connection Closed")
        }

        if(listOfActiveSockets.indexOf(ws) != -1)
        {
            listOfActiveSockets.splice(listOfActiveSockets.indexOf(ws),1);
        }
        playerLeftRemoveFromGame(ws)
    }
}).any('/*', (res: any, req: any) => {
    res.writeHeader('Access-Control-Allow-Origin', '*').writeHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET').end("Hello "+ LIB_VERSION);
}).listen(parseInt(process.env.SERVER_PORT || "8080"), (token: any) => {
    if (token) {
        // console.log("Server started at " + token.address + ":" + token.port);s
        console.log('Listening to port ' + parseInt(process.env.SERVER_PORT || "8080"));
    } else {
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



export function resetTable()
{
    // Table   = new TableGameRoom();
    // console.log("Table Reset")
    setTimeout(() => {
        deleteProcess();
    }, 6000);
}


function playerLeftRemoveFromGame(extWs: any) {
    // console.log("extWs============")
    // console.log(extWs)
    try
    {
        if (extWs == null || extWs.player == null) {
            console.log('Player that left undefined');
            return;
        }
        console.log("Player Left Room " + extWs.player.playerID);

        if (extWs.player.gRoom)
            extWs.player.gRoom?.onSocketClose(extWs.player);
    } catch(error)
    {
        LogErrorToDB({
            functionName : FunctionLogNames.ON_PLAYER_WS_DISCONNECT,
            reason : 'Removing player from server on ws disconnection',
            properties : {},
            time : new Date(),
            servId : process.env.SERVERID,
            errorCode : ErrorCode.NULL
        })
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

        if(ws.isReady)
        {
            // console.log("Checking Active Conenction of " + ws.player.plRoomNetId);
    
            if(ws.isAlive)
            {
                ws.isAlive = false;
            } else
            {
                //Disconnect
                
                console.log('Player Disconnected, WebSocket closing for ' + ws.player.plRoomNetId);
                ws.close();
               // playerLeftRemoveFromGame(ws)
            }

        }

    });


    console.log(new Date());
}, 5000);

callHeartBeatAPI()

setInterval(() => {
    callHeartBeatAPI()
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
}



app.get('/getLiveGames', (res : any, req : any) => {
    /* It does Http as well */
    res.writeStatus('200 OK').writeHeader('Access-Control-Allow-Origin', '*').writeHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET').end(JSON.stringify(getLiveTables()));
});

app.get('/stopRestartingGames', (res : any, req : any) => {
    /* It does Http as well */
    stopRestartingGames();
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
export var TableTypesDict: { [id: number]: any; } = {};

let GameRoomIdCntr: number = 0;
let socketIdCntr: number = 0;
//console.log("After call log");

export let Table : TableGameRoom;
callGetTableTypesAPI(GamesappGameId).then((data: any) => {
    console.log(TableTypesDict);

    Table = new TableGameRoom(TableTypeId);

    setInterval(() => {
        callHeartBeatAPI()
        // console.log(new Date());
    }, 999);

});

export function getEntryFee() {
    return TableTypesDict[TableTypeId].maxEntryFee;
}


export async function createANewPlayer(extWs: any, tableId: string, playerId: string, playerBal: number, pName: string, pImage: string) {


    let newP: Player = new Player(extWs, tableId, playerId+"", pName, pImage);
    
    extWs.player = newP;
    Table.addPlayerToRoom(newP, playerBal);
        console.log("Player addPlayerToRoom end")
        extWs.isReady = true;

    //add player to table

}


// setTimeout(()=> {
//     resetTable();
// }, 30 * 1000);




