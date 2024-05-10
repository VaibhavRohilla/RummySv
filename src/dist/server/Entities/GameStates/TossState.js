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
exports.TossState = void 0;
const apicalls_1 = require("../../apicalls");
const LoggingHandler_1 = require("../LoggingHandler");
const Utils_1 = require("../Utils");
const GameState_1 = require("./GameState");
class TossState extends GameState_1.GameState {
    constructor(table) {
        super(table, Utils_1.GAMESTATE.TOSS);
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
            const oldState = player.playerState;
            //Perform basic leave operations
            this.BasicLeftOperations(player);
            (0, LoggingHandler_1.LogMessage)("Player state : " + oldState, this.table, player);
            //check if player has not already charged
            //mark player as lost 
            //add lost points to player
            //charge player for the game if he has not already been charged
            //call player left API after charging player
            //Mark player ready for result calculation
            if (oldState == Utils_1.PLAYERSTATE.INGAME && !player.isCharged) {
                player.result = "left";
                player.lostPoints = 80;
                this.table.addToPermaLeft(player);
                yield this.table.handleChargePlayer(player, player.lostPoints * this.table.pointsVal, "Player Left Game");
                (0, apicalls_1.CallLeftPlayerAPI)(this.table.tableGameId, player.playerID, Utils_1.RemovePlayerEvent.LEFT);
                player.readyForResultCalculation = true;
            }
            else {
                if (oldState == Utils_1.PLAYERSTATE.DROPPED) {
                    this.table.addToPermaLeft(player);
                }
                //call player left API
                (0, apicalls_1.CallLeftPlayerAPI)(this.table.tableGameId, player.playerID, Utils_1.RemovePlayerEvent.LEFT);
            }
            this.CloseSocket(player);
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
            //mark player as disconnected
            player.isDisconnected = true;
            //send message to other players that player's connection is lost
            this.table.sendMessageToAll({
                t: Utils_1.MSGTYPE.PLEFT,
                data: player.plRoomNetId,
                state: player.playerState
            });
            //Call player left API with event as DISCONNECTED
            (0, apicalls_1.CallLeftPlayerAPI)(this.table.tableGameId, player.playerID, Utils_1.RemovePlayerEvent.DISCONNECTED);
        });
    }
    Kick(player, kickReq) {
        const _super = Object.create(null, {
            Kick: { get: () => super.Kick }
        });
        return __awaiter(this, void 0, void 0, function* () {
            _super.Kick.call(this, player, kickReq);
            // throw new Error("Method not implemented.");
        });
    }
    Errored(player, errorData) {
        const _super = Object.create(null, {
            Errored: { get: () => super.Errored }
        });
        return __awaiter(this, void 0, void 0, function* () {
            _super.Errored.call(this, player, errorData);
            player.playerState = Utils_1.PLAYERSTATE.LEFT;
            this.UnableToJoinError(player, errorData);
        });
    }
}
exports.TossState = TossState;
//# sourceMappingURL=TossState.js.map