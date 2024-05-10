import { Console } from "console";
import { Player } from "./Player";
import { TableGameRoom } from "./TableGameRoom";


// get fs module for creating write streams
const fs = require("fs");


const gameLoggers : {[id : string] : Console} = {};
const tableLoggers : {[id : string] : Console} = {};


export function TableLogInit(table : TableGameRoom)
{
    if(tableLoggers[table.tableGameId])
        return;

    tableLoggers[table.tableGameId] = new Console({
            stdout: fs.createWriteStream(`${table.tableGameId}-stdOut.txt`)
          });


        tableLoggers[table.tableGameId].log(`====${table.tableGameId} | ${process.env.SERVERID}====`);

} 

export function LogInit(table : TableGameRoom)
{
    gameLoggers[table.currentGameRoundId] = new Console({
            stdout: fs.createWriteStream(`${table.currentGameRoundId}-stdOut.txt`)
          });

        gameLoggers[table.currentGameRoundId].log(`====${table.tableGameId} | ${process.env.SERVERID}====`);
}


export function LogMessage(msg : string, table : TableGameRoom, pl : Player | undefined = undefined)
{

    if(!gameLoggers[table.currentGameRoundId])
    {
        TableLogMessage(msg, table);
        return;
    }

    let message = "";
    if(pl)
        message =`${pl.playerID} => ${msg} || ${new Date()}`;
    else
        message = `${msg} || ${new Date()}`;

    gameLoggers[table.currentGameRoundId].log(message); 
}

function TableLogMessage(msg : string, table : TableGameRoom)
{
    let message = "";
        message = `${msg} || ${new Date()}`;

    tableLoggers[table.tableGameId].error(message);  
}


export function LogEnd(table : TableGameRoom)
{
    delete gameLoggers[table.currentGameRoundId];
}

