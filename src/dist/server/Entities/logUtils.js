"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogErrorToDB = exports.LogBalanceDeductFail = exports.LogGameStateToDB = exports.LogGameStates = exports.FunctionLogNames = void 0;
const apicalls_1 = require("../apicalls");
var FunctionLogNames;
(function (FunctionLogNames) {
    FunctionLogNames["ON_PLAYER_WS_DISCONNECT"] = "playerLeftRemoveFromGame";
    FunctionLogNames["ON_PLAYER_CHANGE_TABLE"] = "handleSwitchTable";
})(FunctionLogNames = exports.FunctionLogNames || (exports.FunctionLogNames = {}));
var LogGameStates;
(function (LogGameStates) {
    LogGameStates["GAME_STARTED"] = "GAME STARTED";
    LogGameStates["MONEY_DEDUCTED"] = "MONEY DEDUCTED";
    LogGameStates["RESULT_CALCULATED"] = "RESULT CALCULATED";
    LogGameStates["MONEY_CREDITED"] = "MONEY CREDITED";
    LogGameStates["GAME_END"] = "GAME ENDED";
})(LogGameStates = exports.LogGameStates || (exports.LogGameStates = {}));
function LogGameStateToDB(state, table, data = undefined) {
    try {
        const currentPlayers = [];
        for (let id in table.PlayersUniqIdDict) {
            if (table.PlayersUniqIdDict[id]) {
                currentPlayers.push(table.PlayersUniqIdDict[id].playerID);
            }
        }
        (0, apicalls_1.sendToAnalytics)({ collection: apicalls_1.DBCollectionNames.GAME_STATES_LOGS, data: {
                state: state,
                tableGameID: table.tableGameId,
                players: currentPlayers,
                data: data,
                time: new Date(),
                session: table.currentGameRoundId,
                servID: process.env.SERVERID,
            } });
    }
    catch (error) {
        (0, apicalls_1.sendToAnalytics)({
            collection: apicalls_1.DBCollectionNames.LOGGING_FAILED, data: {
                state: state,
                time: new Date(),
                tableGameID: table.tableGameId,
                session: table.currentGameRoundId,
                servID: process.env.SERVERID,
            }
        });
    }
}
exports.LogGameStateToDB = LogGameStateToDB;
function LogBalanceDeductFail(event, playerID, tableGameID, gameSession, amount) {
    (0, apicalls_1.sendToAnalytics)({ collection: apicalls_1.DBCollectionNames.UnexpectedErrors, data: {
            event: event,
            playerID: playerID,
            tableGameID: tableGameID,
            session: gameSession,
            time: new Date(),
            servID: process.env.SERVERID
        } });
}
exports.LogBalanceDeductFail = LogBalanceDeductFail;
function LogErrorToDB(data) {
    try {
        (0, apicalls_1.sendToAnalytics)({ collection: apicalls_1.DBCollectionNames.ERROR_IN_GAMESERVER, data: data });
    }
    catch (error) {
        (0, apicalls_1.sendToAnalytics)({
            collection: apicalls_1.DBCollectionNames.LOGGING_FAILED, data: {
                functionName: data.functionName,
                ERROR: error,
                time: new Date(),
                ErrorCode: data.errorCode,
                serverID: data.servId
            }
        });
    }
}
exports.LogErrorToDB = LogErrorToDB;
//# sourceMappingURL=logUtils.js.map