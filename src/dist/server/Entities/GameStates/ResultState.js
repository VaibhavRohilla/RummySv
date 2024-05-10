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
exports.ResultState = void 0;
const apicalls_1 = require("../../apicalls");
const LoggingHandler_1 = require("../LoggingHandler");
const Utils_1 = require("../Utils");
const GameState_1 = require("./GameState");
class ResultState extends GameState_1.GameState {
    constructor(table) {
        super(table, Utils_1.GAMESTATE.RESULT);
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
            (0, LoggingHandler_1.LogMessage)("Player " + player.playerID + " Clicked on leave", this.table, player);
            return; // Not possible as leave button gets disabled on result screen on client side
            // throw new Error("Method not implemented.");
        });
    }
    OnWsDisconnect(player) {
        const _super = Object.create(null, {
            OnWsDisconnect: { get: () => super.OnWsDisconnect }
        });
        return __awaiter(this, void 0, void 0, function* () {
            _super.OnWsDisconnect.call(this, player);
            if (player.playerState == Utils_1.PLAYERSTATE.WAITING) {
                this.BasicLeftOperations(player);
                (0, apicalls_1.CallLeftPlayerAPI)(this.table.tableGameId, player.playerID, Utils_1.RemovePlayerEvent.LEFT);
                return;
            }
            player.isDisconnected = true;
            this.table.sendMessageToAll({
                t: Utils_1.MSGTYPE.PLEFT,
                data: player.plRoomNetId,
                state: player.playerState
            });
            (0, apicalls_1.CallLeftPlayerAPI)(this.table.tableGameId, player.playerID, Utils_1.RemovePlayerEvent.DISCONNECTED);
        });
    }
    Kick(player, kickReq) {
        const _super = Object.create(null, {
            Kick: { get: () => super.Kick }
        });
        return __awaiter(this, void 0, void 0, function* () {
            _super.Kick.call(this, player, kickReq);
            //Inactive Players Kick
            // if(player.isDisconnected)
            {
                if (player.playerState != Utils_1.PLAYERSTATE.LEFT)
                    this.BasicLeftOperations(player);
                (0, apicalls_1.CallLeftPlayerAPI)(this.table.tableGameId, player.playerID, Utils_1.RemovePlayerEvent.KICKED);
                this.CloseSocket(player);
            }
            //  else
            // {
            //     LogMessage("Player " + player.playerID + " is not disconnected can't kick", this.table, player);
            // }
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
            this.CloseSocket(player);
        });
    }
}
exports.ResultState = ResultState;
//# sourceMappingURL=ResultState.js.map