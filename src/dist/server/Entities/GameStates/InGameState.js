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
exports.InGameState = void 0;
const apicalls_1 = require("../../apicalls");
const Utils_1 = require("../Utils");
const GameState_1 = require("./GameState");
class InGameState extends GameState_1.GameState {
    constructor(table) {
        super(table, Utils_1.GAMESTATE.INGAME);
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
            // Mark as left
            const oldState = player.playerState;
            //Perform leave actions
            this.BasicLeftOperations(player);
            //check if old state was ingame and is not charged
            //charge player
            //call player left API
            //mark readyForResult true
            //else
            //call player left API
            if (oldState == Utils_1.PLAYERSTATE.INGAME && !player.isCharged) {
                player.result = "left";
                player.lostPoints = 80;
                this.table.addToPermaLeft(player);
                yield this.table.handleChargePlayer(player, 80 * this.table.pointsVal, "Player Left Game");
                (0, apicalls_1.CallLeftPlayerAPI)(this.table.tableGameId, player.playerID, Utils_1.RemovePlayerEvent.LEFT);
                player.readyForResultCalculation = true;
            }
            else {
                if (oldState == Utils_1.PLAYERSTATE.DROPPED) {
                    this.table.addToPermaLeft(player);
                }
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
            // if player is in waiting state
            //perform leave actions
            //call player left API
            //return
            if (player.playerState == Utils_1.PLAYERSTATE.WAITING) {
                this.BasicLeftOperations(player);
                (0, apicalls_1.CallLeftPlayerAPI)(this.table.tableGameId, player.playerID, Utils_1.RemovePlayerEvent.LEFT);
                return;
            }
            //Treat as disconnect
            //Mark as disconnected
            player.isDisconnected = true;
            //Perform disconnect actions
            this.table.sendMessageToAll({
                t: Utils_1.MSGTYPE.PLEFT,
                data: player.plRoomNetId,
                state: player.playerState
            });
            //call player left API
            (0, apicalls_1.CallLeftPlayerAPI)(this.table.tableGameId, player.playerID, Utils_1.RemovePlayerEvent.DISCONNECTED);
        });
    }
    Kick(player, kickReq) {
        const _super = Object.create(null, {
            Kick: { get: () => super.Kick }
        });
        return __awaiter(this, void 0, void 0, function* () {
            _super.Kick.call(this, player, kickReq);
            if (!player.isDisconnected) {
                this.table.sendMessageToAll({
                    t: Utils_1.MSGTYPE.PLEFT,
                    data: player.plRoomNetId,
                    state: player.playerState
                });
            }
            this.BasicLeftOperations(player);
            player.lostPoints = 80;
            player.result = "lost";
            this.table.addToPermaLeft(player);
            yield this.table.handleChargePlayer(player, 80 * this.table.pointsVal, "Three Skips Kicked");
            (0, apicalls_1.CallLeftPlayerAPI)(this.table.tableGameId, player.playerID, kickReq.removeEvent);
            (0, apicalls_1.sendToAnalytics)({
                collection: apicalls_1.DBCollectionNames.GAME_EVENTS,
                data: {
                    type: "ThreeSkipsKicked",
                    playerId: player.playerID,
                    tableGameId: this.table.tableGameId,
                    gameRoundId: this.table.currentGameRoundId,
                    time: new Date()
                }
            });
            let plKillMsg = {
                t: Utils_1.MSGTYPE.THREESKIPS,
                plId: player.plRoomNetId
            };
            player.sendMessage(plKillMsg);
            this.CloseSocket(player);
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
exports.InGameState = InGameState;
//# sourceMappingURL=InGameState.js.map