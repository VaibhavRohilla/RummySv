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
exports.RestartingState = void 0;
const apicalls_1 = require("../../apicalls");
const Utils_1 = require("../Utils");
const GameState_1 = require("./GameState");
class RestartingState extends GameState_1.GameState {
    constructor(table) {
        super(table, Utils_1.GAMESTATE.RESTARTING);
    }
    OnStateEnter() {
        // throw new Error("Method not implemented.");
    }
    OnStateExit() {
        // throw new Error("Method not implemented.");
    }
    OnPlayerJoin(player) {
        // throw new Error("Method not implemented.");
    }
    OnLeaveClicked(player) {
        const _super = Object.create(null, {
            OnLeaveClicked: { get: () => super.OnLeaveClicked }
        });
        return __awaiter(this, void 0, void 0, function* () {
            _super.OnLeaveClicked.call(this, player);
            this.OnWsDisconnect(player);
            this.CloseSocket(player);
        });
    }
    OnWsDisconnect(player) {
        const _super = Object.create(null, {
            OnWsDisconnect: { get: () => super.OnWsDisconnect }
        });
        return __awaiter(this, void 0, void 0, function* () {
            _super.OnWsDisconnect.call(this, player);
            //Set player state to Left
            player.playerState = Utils_1.PLAYERSTATE.LEFT;
            //send message to other players that player has left
            this.table.sendMessageToAll({
                t: Utils_1.MSGTYPE.PLEFT,
                data: player.plRoomNetId,
                state: player.playerState
            });
            //Delete player from PlayersUniqIdDict in TableGameRoom
            delete this.table.PlayersUniqIdDict[player.plRoomNetId];
            //Decrease player count in TableGameRoom
            console.log('RestartingState : Decreasing player count in TableGameRoom : ' + this.table.currentPlayersCount);
            this.table.currentPlayersCount--;
            //call player left API
            (0, apicalls_1.CallLeftPlayerAPI)(this.table.tableGameId, player.playerID, Utils_1.RemovePlayerEvent.PRELEFT);
        });
    }
    Kick(player, kickReq) {
        const _super = Object.create(null, {
            Kick: { get: () => super.Kick }
        });
        return __awaiter(this, void 0, void 0, function* () {
            _super.Kick.call(this, player, kickReq);
            (0, apicalls_1.sendToAnalytics)({
                collection: apicalls_1.DBCollectionNames.UnexpectedErrors,
                data: {
                    error: "KickInRestartingState",
                    tableId: this.table.tableGameId,
                    playerId: player.playerID,
                    kickReq: kickReq,
                    state: player.playerState,
                    gameRoundId: this.table.currentGameRoundId,
                }
            });
            // if(player.isDisconnected)
            {
                this.BasicLeftOperations(player);
                (0, apicalls_1.CallLeftPlayerAPI)(this.table.tableGameId, player.playerID, Utils_1.RemovePlayerEvent.KICKED);
                this.CloseSocket(player);
            }
        });
    }
    Errored(player, errorData) {
        const _super = Object.create(null, {
            Errored: { get: () => super.Errored }
        });
        return __awaiter(this, void 0, void 0, function* () {
            _super.Errored.call(this, player, errorData);
            player.playerState = Utils_1.PLAYERSTATE.LEFT;
            if (errorData.code == Utils_1.ErrorCode.INSUFFICIENT_BALANCE) {
                player.sendMessage({
                    t: Utils_1.MSGTYPE.ERROR,
                    msg: errorData.msg
                });
                this.BasicLeftOperations(player);
                (0, apicalls_1.CallLeftPlayerAPI)(this.table.tableGameId, player.playerID, Utils_1.RemovePlayerEvent.ERRORED);
            }
            else
                this.UnableToJoinError(player, errorData);
        });
    }
}
exports.RestartingState = RestartingState;
//# sourceMappingURL=RestartingState.js.map