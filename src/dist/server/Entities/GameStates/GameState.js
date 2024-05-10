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
exports.GameStateHandler = exports.GameState = void 0;
const apicalls_1 = require("../../apicalls");
const DataTypes_1 = require("../../DataTypes");
const LoggingHandler_1 = require("../LoggingHandler");
const Utils_1 = require("../Utils");
class GameState {
    constructor(table, id) {
        this.table = table;
        this.id = id;
        // this.table.gameState = this;        
    }
    get ID() { return this.id; }
    OnPlayerLeave(player, leaveState) {
        return __awaiter(this, void 0, void 0, function* () {
            if (player.playerState == Utils_1.PLAYERSTATE.LEFT) {
                //if player is already left then return as we have already handled this
                (0, LoggingHandler_1.LogMessage)("Player is already left, returning from OnPlayerLeave method", this.table, player);
                return;
            }
            if (leaveState == DataTypes_1.LeaveState.LEAVE_CLICKED) {
                yield this.OnLeaveClicked(player);
            }
            else if (leaveState == DataTypes_1.LeaveState.WS_DISCONNECT) {
                //if player is already disconnected then dont do anything as it's already handled
                if (!player.isDisconnected)
                    yield this.OnWsDisconnect(player);
                else
                    (0, LoggingHandler_1.LogMessage)("Player is already disconnected, returning from OnPlayerLeave method", this.table, player);
            }
        });
    }
    OnLeaveClicked(player) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, LoggingHandler_1.LogMessage)("Player " + player.playerID + " left the game", this.table, player);
        });
    }
    OnWsDisconnect(player) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, LoggingHandler_1.LogMessage)("Player " + player.playerID + " disconnected from table " + this.table.tableGameId, this.table, player);
        });
    }
    Errored(player, errorData) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, LoggingHandler_1.LogMessage)("Error in player " + player.playerID + " : " + errorData.code + " : " + errorData.msg, this.table, player);
        });
    }
    Kick(player, kickReq) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, LoggingHandler_1.LogMessage)("Kicked player " + player.playerID + " : " + kickReq.removeEvent, this.table, player);
        });
    }
    UnableToJoinError(player, errorData) {
        errorData.msg += ` Error Code: ${errorData.code}`;
        player.sendMessage({
            t: Utils_1.MSGTYPE.ERROR,
            msg: errorData.msg,
        });
        player.infoLog("UnableToJoin", errorData);
        (0, apicalls_1.CallLeftPlayerAPI)(this.table.tableGameId, player.playerID, Utils_1.RemovePlayerEvent.ERRORED);
        this.CloseSocket(player);
    }
    BasicLeftOperations(player) {
        player.playerState = Utils_1.PLAYERSTATE.LEFT;
        this.table.sendMessageToAll({
            t: Utils_1.MSGTYPE.PLEFT,
            data: player.plRoomNetId,
            state: player.playerState
        });
        delete this.table.PlayersUniqIdDict[player.plRoomNetId];
        this.table.currentPlayersCount--;
        //TODO : can set gRoom of player to null here as this is the last place where we use it
        (0, LoggingHandler_1.LogMessage)(`Player ${player.playerID} deleted from the game`, this.table, player);
    }
    CloseSocket(player) {
        if (player.plSocket && player.plSocket.isConnectionAlive) {
            player.plSocket.close();
        }
    }
}
exports.GameState = GameState;
const FinishingState_1 = require("./FinishingState");
const InGameState_1 = require("./InGameState");
const MatchmakingState_1 = require("./MatchmakingState");
const RestartingState_1 = require("./RestartingState");
const ResultState_1 = require("./ResultState");
const SubmitingState_1 = require("./SubmitingState");
const TossState_1 = require("./TossState");
class GameStateHandler {
    constructor(table) {
        this.table = table;
        this.currentState = new MatchmakingState_1.MatchmakingState(table);
        // this.currentState.OnStateEnter();
    }
    OnPlayerJoin(player) {
        this.currentState.OnPlayerJoin(player);
    }
    OnPlayerLeave(player, leaveState) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.currentState.OnPlayerLeave(player, leaveState);
        });
    }
    OnKickPlayer(player, kickReq) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.currentState.Kick(player, kickReq);
        });
    }
    OnError(player, errorData) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.currentState.Errored(player, errorData);
        });
    }
    OnStateEnter() {
        this.currentState.OnStateEnter();
    }
    OnStateExit() {
        this.currentState.OnStateExit();
    }
    SetState(state) {
        // if(this.currentState)
        //     this.currentState.OnStateExit();
        switch (state) {
            case Utils_1.GAMESTATE.MATCHMAKING:
                this.currentState = new MatchmakingState_1.MatchmakingState(this.table);
                break;
            case Utils_1.GAMESTATE.TOSS:
                this.currentState = new TossState_1.TossState(this.table);
                break;
            case Utils_1.GAMESTATE.INGAME:
                this.currentState = new InGameState_1.InGameState(this.table);
                break;
            case Utils_1.GAMESTATE.FINISHING:
                this.currentState = new FinishingState_1.FinishingState(this.table);
                break;
            case Utils_1.GAMESTATE.SUBMITING:
                this.currentState = new SubmitingState_1.SubmitingState(this.table);
                break;
            case Utils_1.GAMESTATE.RESULT:
                this.currentState = new ResultState_1.ResultState(this.table);
                break;
            case Utils_1.GAMESTATE.RESTARTING:
                this.currentState = new RestartingState_1.RestartingState(this.table);
                break;
        }
        (0, LoggingHandler_1.LogMessage)("Game State Changed to " + Utils_1.GAMESTATE[this.GetState], this.table);
        // this.OnStateEnter();
    }
    get GetState() {
        return this.currentState.ID;
    }
}
exports.GameStateHandler = GameStateHandler;
//# sourceMappingURL=GameState.js.map