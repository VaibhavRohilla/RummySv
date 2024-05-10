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
exports.FinishingState = void 0;
const apicalls_1 = require("../../apicalls");
const LoggingHandler_1 = require("../LoggingHandler");
const Utils_1 = require("../Utils");
const GameState_1 = require("./GameState");
class FinishingState extends GameState_1.GameState {
    constructor(table) {
        super(table, Utils_1.GAMESTATE.FINISHING);
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
            this.BasicLeftOperations(player);
            //if player is supposed to declare cards
            //check if player has declared cards
            //if yes, Don't Kick him yet 
            //else
            //end final turn timeout
            //declare cards
            //if player is not supposed to declare cards
            //check if old state was ingame and is not charged
            //charge player
            //call player left API
            //mark readyForResult true
            //else
            //call player left API
            if (player.plRoomNetId == this.table.declarePlId) {
                (0, LoggingHandler_1.LogMessage)('has Player Submitted On Finish State : ' + player.hasSubmitted, this.table);
                // if( PLAYERSTATE.LEFT == player.playerState)
                // {
                //     this.table.addToPermaLeft(player);
                // await this.table.handleDeclare(player, player.cardFormationString);
                // }
                if (player.hasSubmitted) {
                    //Don't kick him yet because he is winner
                    this.table.addToPermaLeft(player);
                }
                else {
                    // Three Skips //Disconnect //tabout  
                    if (player.finalTurnTimeout != null)
                        clearTimeout(player.finalTurnTimeout);
                    this.table.addToPermaLeft(player);
                    yield this.table.handleDeclare(player, player.cardFormationString);
                }
            }
            else {
                if (oldState == Utils_1.PLAYERSTATE.INGAME && !player.isCharged) {
                    player.result = "left";
                    player.lostPoints = 80;
                    this.table.addToPermaLeft(player);
                    yield this.table.handleChargePlayer(player, 80 * this.table.pointsVal, "Player Left Game");
                    (0, apicalls_1.CallLeftPlayerAPI)(this.table.tableGameId, player.playerID, Utils_1.RemovePlayerEvent.LEFT);
                    player.readyForResultCalculation = true;
                }
                else {
                    if (oldState == Utils_1.PLAYERSTATE.DROPPED)
                        this.table.addToPermaLeft(player);
                    (0, apicalls_1.CallLeftPlayerAPI)(this.table.tableGameId, player.playerID, Utils_1.RemovePlayerEvent.LEFT);
                    player.result = "left";
                }
            }
            //close socket
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
exports.FinishingState = FinishingState;
//# sourceMappingURL=FinishingState.js.map