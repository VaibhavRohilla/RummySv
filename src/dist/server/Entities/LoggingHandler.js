"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogEnd = exports.LogMessage = exports.LogInit = exports.TableLogInit = void 0;
const console_1 = require("console");
// get fs module for creating write streams
const fs = require("fs");
const gameLoggers = {};
const tableLoggers = {};
function TableLogInit(table) {
    if (tableLoggers[table.tableGameId])
        return;
    tableLoggers[table.tableGameId] = new console_1.Console({
        stdout: fs.createWriteStream(`${table.tableGameId}-stdOut.txt`)
    });
    tableLoggers[table.tableGameId].log(`====${table.tableGameId} | ${process.env.SERVERID}====`);
}
exports.TableLogInit = TableLogInit;
function LogInit(table) {
    gameLoggers[table.currentGameRoundId] = new console_1.Console({
        stdout: fs.createWriteStream(`${table.currentGameRoundId}-stdOut.txt`)
    });
    gameLoggers[table.currentGameRoundId].log(`====${table.tableGameId} | ${process.env.SERVERID}====`);
}
exports.LogInit = LogInit;
function LogMessage(msg, table, pl = undefined) {
    if (!gameLoggers[table.currentGameRoundId]) {
        TableLogMessage(msg, table);
        return;
    }
    let message = "";
    if (pl)
        message = `${pl.playerID} => ${msg} || ${new Date()}`;
    else
        message = `${msg} || ${new Date()}`;
    gameLoggers[table.currentGameRoundId].log(message);
}
exports.LogMessage = LogMessage;
function TableLogMessage(msg, table) {
    let message = "";
    message = `${msg} || ${new Date()}`;
    tableLoggers[table.tableGameId].error(message);
}
function LogEnd(table) {
    delete gameLoggers[table.currentGameRoundId];
}
exports.LogEnd = LogEnd;
//# sourceMappingURL=LoggingHandler.js.map