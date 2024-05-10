"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAYERSTATE = exports.Player = void 0;
const apicalls_1 = require("../apicalls");
// import { getDBOptions} from "../server";
const Card_1 = require("./Card");
const LoggingHandler_1 = require("./LoggingHandler");
const Utils_1 = require("./Utils");
Object.defineProperty(exports, "PLAYERSTATE", { enumerable: true, get: function () { return Utils_1.PLAYERSTATE; } });
class Player {
    // private logger : winston.Logger;
    constructor(plSocket, tableGameID, playerID, plName, plImage) {
        // this.logger = winston.createLogger({
        //     defaultMeta : {service : "GameServer", tableId : this.tableGameID},
        //     format : winston.format.combine(
        //         winston.format.timestamp(),
        //         winston.format.json(),
        //         winston.format.metadata()
        //     ),
        //     transports : [
        //         new winston.transports.MongoDB(getDBOptions(this.playerID)),
        //         new winston.transports.Console({
        //             format : winston.format.combine(
        //                 winston.format.colorize(),
        //                 winston.format.simple()
        //             )
        //         })
        //     ]
        // });
        this.plSocket = plSocket;
        this.tableGameID = tableGameID;
        this.playerID = playerID;
        this.plName = plName;
        this.plImage = plImage;
        this.hasSubmitted = false;
        this.hasDeposited = false;
        this.currentDeck = [];
        this.cardFormation = [];
        this.savedTime = 90;
        //common
        this.plRoomNetId = -1;
        this.gRoom = null;
        //currentDeckFormation
        // finalCardsFormation : any[] = [];
        this.score = 0;
        //TDL is this even populated?
        this.balance = -1;
        this.sixRollStreak = 0;
        //public playerTokens: Token[] = [];
        this.skippedTurns = 0;
        this.isCharged = false;
        this.readyForResultCalculation = false;
        this.isDisconnected = false; //is disconnected
        this.state = Utils_1.PLAYERSTATE.INGAME;
        this.noOfTurns = 0;
        this.reward = 0;
        this.lastPickedCard = undefined;
        this.infoLog("Player created");
    }
    // hasLeft : boolean = false;
    // hasDropped : boolean = false;
    // isWaiting : boolean = false;
    get isBlacklisted() {
        return this.state == Utils_1.PLAYERSTATE.DROPPED || this.state == Utils_1.PLAYERSTATE.WAITING;
    }
    sendUpdatedGID() {
        if (!this.gRoom)
            return;
        const id = this.gRoom.tableGameId + (this.gRoom.currentGameRoundId.length > 0 ? "_" + this.gRoom.currentGameRoundId : "");
        this.sendMessage({
            t: "gId",
            gId: (0, Utils_1.ConvertTextToBase64)(id)
        });
    }
    infoLog(message, metadata) {
        // this.logger.log({
        //     level: 'info',
        //     message: message,
        //     metadata: metadata
        //     // metadata : {playerID: this.playerID, tableGameID: this.tableGameID, ...metadata}
        // });
        // this.logger.info(message, metadata);
    }
    get playerState() {
        return this.state;
    }
    set playerState(state) {
        if (this.gRoom)
            (0, LoggingHandler_1.LogMessage)(`Player ${this.plName} state changed to ${Utils_1.PLAYERSTATE[state]}`, this.gRoom, this);
        this.infoLog(`State Changed`, { state: Utils_1.PLAYERSTATE[state] });
        this.state = state;
    }
    get cardFormationString() {
        return this.cardFormation.map(x => x.map(y => y.name));
    }
    addCardToDeck(card, formationIndex = -1) {
        this.currentDeck.push(card); //Add card to deck
        if (formationIndex == -1) {
            this.cardFormation.push([card]);
        }
        else {
            this.cardFormation[formationIndex].push(card);
        }
    }
    checkIfCardExists(card) {
        for (let i = 0; i < this.currentDeck.length; i++) {
            if (this.currentDeck[i].name == card.name) {
                return true;
            }
        }
        return false;
    }
    removeCardFromDeck(card, removeFromFormation = false) {
        //Find Card index from deck
        const index = this.currentDeck.findIndex(x => x.name == card.name);
        if (index != -1) {
            this.currentDeck.splice(index, 1); //Remove card from deck
        }
        if (removeFromFormation) {
            //Find Card index from formation
            const formationIndex = this.cardFormation.findIndex(x => x.findIndex(y => y.name == card.name) != -1);
            if (formationIndex != -1) {
                const cardIndex = this.cardFormation[formationIndex].findIndex(x => x.name == card.name);
                if (cardIndex != -1) {
                    this.cardFormation[formationIndex].splice(cardIndex, 1);
                }
                if (this.cardFormation[formationIndex].length == 0) {
                    this.cardFormation.splice(formationIndex, 1);
                }
            }
            if (this.gRoom)
                (0, LoggingHandler_1.LogMessage)(`Formation after removing card ${card.name} : ${JSON.stringify(this.cardFormationString)}`, this.gRoom, this);
        }
    }
    updateDeckFormation(formation) {
        this.cardFormation = [];
        let cardsCount = 0;
        for (let i = 0; i < formation.length; i++) {
            if (formation[i].length == 0)
                continue;
            const cards = [];
            if (Array.isArray(formation[i])) {
                for (let j = 0; j < formation[i].length; j++) {
                    cards.push(Card_1.Card.convertToCard(formation[i][j]));
                    cardsCount++;
                }
            }
            else {
                cards.push(Card_1.Card.convertToCard(formation[i]));
                cardsCount++;
            }
            this.cardFormation.push(cards);
        }
        // this.cardFormation = formation.map(x => x.map(y => Card.convertToCard(y)));
        if (cardsCount != this.currentDeck.length) {
            if (this.gRoom)
                (0, LoggingHandler_1.LogMessage)(`Error in deck formation. Deck length : ${this.currentDeck.length} , Formation length : ${cardsCount}`, this.gRoom, this);
        }
        if (this.gRoom)
            (0, LoggingHandler_1.LogMessage)(`Player ${this.plName} deck formation updated, CardFormation : ${JSON.stringify(this.cardFormation)}`, this.gRoom, this);
    }
    // remove()
    // {
    // }
    reset() {
        this.state = Utils_1.PLAYERSTATE.INGAME;
        this.skippedTurns = 0;
        this.score = 0;
        this.balance = -1;
        this.noOfTurns = 0;
        this.reward = 0;
        this.lastPickedCard = undefined;
        this.isCharged = false;
        this.cardFormation = [];
        // this.finalCardsFormation = [];
        this.currentDeck = [];
        this.hasSubmitted = false;
        this.readyForResultCalculation = false;
    }
    restartReset() {
        this.cardFormation = [];
        this.currentDeck = [];
    }
    //id of game session player is inside
    sendMessage(content, isBinary = false) {
        // if (content.t == "timer" || content.t == "turnTimer") {
        // } else {
        //     //  console.log("Sending to "+ this.plName +"----");
        //     //  console.log(content);
        // }
        if (this.plSocket && this.plSocket.isConnectionAlive) {
            if (isBinary)
                this.plSocket.send(content);
            else {
                try {
                    this.plSocket.send(JSON.stringify(content));
                }
                catch (_a) {
                    // console.log("Error in sending message to player");
                    console.log(content);
                    (0, apicalls_1.sendToAnalytics)({
                        collection: apicalls_1.DBCollectionNames.UnexpectedErrors,
                        data: {
                            type: "SOCKET_NULL",
                            msg: "Error in sending message to player",
                            playerId: this.playerID,
                            tableGameId: this.tableGameID,
                            content: content,
                        }
                    });
                    // throw new Error("Error in sending message to player");
                }
            }
        }
    }
}
exports.Player = Player;
//# sourceMappingURL=Player.js.map