"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MSGTYPE = exports.ConvertBase64ToText = exports.ConvertTextToBase64 = exports.GAMESTATE = exports.PLAYERSTATE = exports.JOINEDCASE = exports.LEAVECASE = exports.TimeoutKeeper = exports.isValidSet = exports.isValidImpureSequence = exports.isValidPureSequence = exports.RemovePlayerEvent = exports.TxReasons = exports.GAMEENDCONDITION = exports.ErrorMessage = exports.ErrorCode = exports.getServerState = exports.TableTypeId = exports.ServerID = exports.GamesappGameId = void 0;
exports.GamesappGameId = "2";
const server_1 = require("../server");
const DataTypes_1 = require("./DataTypes");
//moved tokens
//three six
//turn skipped
//no valid move
//all tokens in already
exports.ServerID = process.env.SERVERID ? process.env.SERVERID : "GS0";
exports.TableTypeId = parseInt(process.env.TABLETYPEID ? process.env.TABLETYPEID : "2");
function getServerState() {
    if (server_1.Table) {
        if (server_1.Table.gameInStartProcess) {
            return DataTypes_1.ServerState.IN_GAME;
        }
        else {
            // if(isReserved) {
            //     return ServerState.RESERVED;
            // } else
            //
            if (server_1.Table.currentPlayersCount > 0) {
                return DataTypes_1.ServerState.MATCHMAKING;
            }
            else {
                return DataTypes_1.ServerState.ONLINE;
            }
        }
    }
    return null;
}
exports.getServerState = getServerState;
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["NULL"] = "Ez0000";
    ErrorCode["FULL_TABLE"] = "Ez0001";
    ErrorCode["PLAYER_AS_NULL"] = "Ez0002";
    ErrorCode["GAME_STARTED"] = "Ez0003";
    ErrorCode["INSUFFICIENT_BALANCE"] = "Ez0004";
})(ErrorCode = exports.ErrorCode || (exports.ErrorCode = {}));
var ErrorMessage;
(function (ErrorMessage) {
    ErrorMessage["InsufficientBalance"] = "InsufficientBalance";
    ErrorMessage["UnableToJoin"] = "Unable to join table";
})(ErrorMessage = exports.ErrorMessage || (exports.ErrorMessage = {}));
var GAMEENDCONDITION;
(function (GAMEENDCONDITION) {
    GAMEENDCONDITION["MOVTOKEN"] = "moveToken";
    GAMEENDCONDITION["THREESIX"] = "threeSix";
    GAMEENDCONDITION["TURNSKIPPED"] = "turnSkipped";
    GAMEENDCONDITION["NOVALIDMODE"] = "noValidMove";
    GAMEENDCONDITION["OPPONENTINVALIDDECLARE"] = "opponentInvalidDeclare";
    GAMEENDCONDITION["ALLOPPONENTLEFT"] = "allOpponentLeft";
})(GAMEENDCONDITION = exports.GAMEENDCONDITION || (exports.GAMEENDCONDITION = {}));
var TxReasons;
(function (TxReasons) {
    TxReasons["WIN"] = "win";
    TxReasons["LOSE"] = "lose";
    TxReasons["REFUND_NOMATCH"] = "refund-nomatch";
    TxReasons["REFUND_ERROR"] = "refund-error";
    TxReasons["REFUND_FORCECLOSED"] = "refund-forceclosed";
})(TxReasons = exports.TxReasons || (exports.TxReasons = {}));
var RemovePlayerEvent;
(function (RemovePlayerEvent) {
    RemovePlayerEvent[RemovePlayerEvent["DISCONNECTED"] = 0] = "DISCONNECTED";
    RemovePlayerEvent[RemovePlayerEvent["LEFT"] = 1] = "LEFT";
    RemovePlayerEvent[RemovePlayerEvent["KICKED"] = 2] = "KICKED";
    RemovePlayerEvent[RemovePlayerEvent["SWITCHED"] = 3] = "SWITCHED";
    RemovePlayerEvent[RemovePlayerEvent["ERRORED"] = 4] = "ERRORED";
    RemovePlayerEvent[RemovePlayerEvent["PRELEFT"] = 5] = "PRELEFT";
    RemovePlayerEvent[RemovePlayerEvent["TIMEOUT"] = 6] = "TIMEOUT";
})(RemovePlayerEvent = exports.RemovePlayerEvent || (exports.RemovePlayerEvent = {}));
function isValidPureSequence(cards) {
    //false is less than 3 cards
    if (cards.length < 3)
        return false;
    //false if joker in here
    for (let i = 0; i < cards.length; i++) {
        let cardVal = parseInt(cards[i].split('-')[0]);
        let cardType = parseInt(cards[i].split('-')[1]);
        if (cardVal == 0 && cardType == 0) {
            //isJoker
            return false;
        }
    }
    let seqType = -1;
    for (let i = 0; i < cards.length; i++) {
        let cardVal = parseInt(cards[i].split('-')[0]);
        let cardType = parseInt(cards[i].split('-')[1]);
        if (seqType == -1)
            seqType = cardType;
        if (cardType != seqType)
            return false;
    }
    let aceCards = [];
    let restCards = [];
    for (let i = 0; i < cards.length; i++) {
        let cardVal = parseInt(cards[i].split('-')[0]);
        let cardType = parseInt(cards[i].split('-')[1]);
        if (cardVal == 1)
            aceCards.push(cards[i]);
        else
            restCards.push(cards[i]);
    }
    restCards = sortCards(restCards);
    //console.log(aceCards)
    //console.log(restCards)
    let prevCardVal = -1;
    for (let i = 0; i < restCards.length; i++) {
        let cardVal = parseInt(restCards[i].split('-')[0]);
        let cardType = parseInt(restCards[i].split('-')[1]);
        if (prevCardVal == -1) {
            prevCardVal = cardVal;
        }
        else {
            if (cardVal == prevCardVal + 1) {
                prevCardVal = cardVal;
                continue;
            }
            else {
                return false;
            }
        }
    }
    //Check if there are ace cards then fit it
    if (aceCards.length > 0) {
        let lastCard = restCards[restCards.length - 1];
        let cardVal = parseInt(lastCard.split('-')[0]);
        if (cardVal == 13) {
            restCards.push(aceCards.pop());
        }
    }
    if (aceCards.length > 0) {
        let firstCard = restCards[0];
        let cardVal = parseInt(firstCard.split('-')[0]);
        if (cardVal == 2) {
            let card = aceCards.pop();
            restCards.splice(0, 0, card);
        }
    }
    //console.log(aceCards)
    //console.log(restCards)
    if (aceCards.length == 0)
        return true;
    else
        return false;
}
exports.isValidPureSequence = isValidPureSequence;
function isValidImpureSequence(cards, jokerCardVal) {
    //console.log(cards)
    //false is less than 3 cards
    if (cards.length < 3)
        return false;
    let jokers = [];
    let withoutJokers = [];
    //false if joker in here
    for (let i = 0; i < cards.length; i++) {
        let cardVal = parseInt(cards[i].split('-')[0]);
        let cardType = parseInt(cards[i].split('-')[1]);
        if (cardVal == 0 || cardVal == jokerCardVal) {
            jokers.push(cards[i]);
        }
        else {
            withoutJokers.push(cards[i]);
        }
    }
    let seqType = -1;
    for (let i = 0; i < withoutJokers.length; i++) {
        let cardVal = parseInt(withoutJokers[i].split('-')[0]);
        let cardType = parseInt(withoutJokers[i].split('-')[1]);
        if (seqType == -1)
            seqType = cardType;
        if (cardType != seqType)
            return false;
    }
    let aceCards = [];
    let restCards = [];
    for (let i = 0; i < withoutJokers.length; i++) {
        let cardVal = parseInt(withoutJokers[i].split('-')[0]);
        let cardType = parseInt(withoutJokers[i].split('-')[1]);
        if (cardVal == 1)
            aceCards.push(withoutJokers[i]);
        else
            restCards.push(withoutJokers[i]);
    }
    restCards = sortCards(restCards);
    //console.log(aceCards)
    //console.log(jokers)
    //console.log(restCards)
    let prevCardVal = -1;
    if (aceCards.length > 0) {
        if (restCards.length > 0) {
            let lastCard = restCards[restCards.length - 1];
            let lastCardVal = parseInt(lastCard.split('-')[0]);
            let firstCard = restCards[0];
            let firstCardVal = parseInt(firstCard.split('-')[0]);
            if (13 - lastCardVal > firstCardVal - 2) {
                //ace card in starting
                restCards.splice(0, 0, aceCards.pop());
            }
            else {
                //ace card in the end
                restCards.push(aceCards.pop());
            }
        }
        else {
            restCards.push(aceCards.pop());
        }
    }
    //console.log(restCards)
    let newCards = [];
    let jokersNeeded = 0;
    for (let i = 0; i < restCards.length; i++) {
        let cardVal = parseInt(restCards[i].split('-')[0]);
        let cardType = parseInt(restCards[i].split('-')[1]);
        if (prevCardVal == -1) {
            prevCardVal = cardVal;
            newCards.push(restCards[i]);
        }
        else {
            if (cardVal == prevCardVal + 1) {
                prevCardVal = cardVal;
                newCards.push(restCards[i]);
            }
            else {
                if (cardVal == 1) {
                    jokersNeeded = 14 - prevCardVal - 1;
                    prevCardVal = 14;
                }
                else {
                    jokersNeeded = cardVal - prevCardVal - 1;
                    prevCardVal = cardVal;
                }
                // console.log("jokers need=" + jokersNeeded)
                if (jokersNeeded < 0) {
                    return false;
                }
                while (jokersNeeded > 0) {
                    if (jokers.length <= 0)
                        return false;
                    newCards.push(jokers.pop());
                    jokersNeeded--;
                }
                newCards.push(restCards[i]);
            }
        }
    }
    //console.log("new cards =" + newCards)
    //console.log(jokers)
    //console.log(aceCards)
    //console.log(newCards)
    if (aceCards.length != 0)
        return false;
    //adjust the jokers
    if (restCards.length > 0) {
        let lastCard = restCards[restCards.length - 1];
        let lastCardVal = parseInt(lastCard.split('-')[0]);
        //  if (lastCardVal != 1) {
        let placableJokers = 14 - lastCardVal;
        //	console.log(placableJokers)
        while (placableJokers > 0 && jokers.length > 0) {
            newCards.push(jokers.pop());
            placableJokers--;
        }
        //  }
        let firstCard = restCards[0];
        let firstCardVal = parseInt(firstCard.split('-')[0]);
        //  if (firstCardVal != 1) {
        placableJokers = firstCardVal - 1;
        //	console.log(placableJokers)
        while (placableJokers > 0 && jokers.length > 0) {
            newCards.splice(0, 0, jokers.pop());
            placableJokers--;
        }
    }
    else {
        while (jokers.length > 0) {
            newCards.splice(0, 0, jokers.pop());
        }
    }
    //(newCards)
    if (jokers.length == 0)
        return true; //{result: true, cards:newCards}
    else
        return false; // {result: false, cards:[]}
    //help with other cards as jokers
}
exports.isValidImpureSequence = isValidImpureSequence;
function isValidSet(cards, jokerCardVal) {
    let setVal = -1;
    if (cards.length < 3 || cards.length > 4) //set can have 3 or 4 cards only
        return false;
    let seqTypeIncluded = [];
    for (let i = 0; i < cards.length; i++) {
        let cardVal = parseInt(cards[i].split('-')[0]);
        let cardType = parseInt(cards[i].split('-')[1]);
        if (cardVal == 0 && cardType == 0) {
            //isJoker
            continue;
        }
        else if (cardVal == jokerCardVal) {
            //isJoker
            continue;
        }
        else {
            if (setVal == -1) {
                setVal = cardVal;
            }
            if (cardVal != setVal || seqTypeIncluded.includes(cardType)) {
                return false;
            }
            else {
                seqTypeIncluded.push(cardType);
                continue;
            }
        }
    }
    return true;
}
exports.isValidSet = isValidSet;
function sortCards(cards) {
    for (var i = 0; i < cards.length; i++) {
        for (var j = 0; j < cards.length; j++) {
            let cardVali = parseInt(cards[i].split('-')[0]);
            let cardValj = parseInt(cards[j].split('-')[0]);
            if (cardVali < cardValj) {
                var temp = cards[i];
                cards[i] = cards[j];
                cards[j] = temp;
            }
        }
    }
    return cards;
}
class TimeoutKeeper {
    constructor(delayTime, timeoutRef) {
        this.delayTime = delayTime;
        this.timeoutRef = timeoutRef;
        this.startTime = -1;
        this.startTime = Date.now();
    }
    get getRemainingTime() {
        const elapsed = Date.now() - this.startTime;
        const remainingTime = this.delayTime - elapsed;
        return Math.floor(remainingTime / 1000);
    }
}
exports.TimeoutKeeper = TimeoutKeeper;
var LEAVECASE;
(function (LEAVECASE) {
    LEAVECASE[LEAVECASE["LEFTWHILEDECLARE"] = 0] = "LEFTWHILEDECLARE";
    LEAVECASE[LEAVECASE["LEFTWHILESUBMIT"] = 1] = "LEFTWHILESUBMIT";
    LEAVECASE[LEAVECASE["LEFTINGAME"] = 2] = "LEFTINGAME";
    LEAVECASE[LEAVECASE["LEFTWHILEMATCHING"] = 3] = "LEFTWHILEMATCHING";
    LEAVECASE[LEAVECASE["LEFTWHILEDROPPED"] = 4] = "LEFTWHILEDROPPED";
    LEAVECASE[LEAVECASE["LEFTWITHPERMALEFT"] = 5] = "LEFTWITHPERMALEFT";
})(LEAVECASE = exports.LEAVECASE || (exports.LEAVECASE = {}));
var JOINEDCASE;
(function (JOINEDCASE) {
    JOINEDCASE[JOINEDCASE["JOINEDWHILETOSS"] = 0] = "JOINEDWHILETOSS";
    JOINEDCASE[JOINEDCASE["JOINEDWHILEGAMESTARTED"] = 1] = "JOINEDWHILEGAMESTARTED";
    JOINEDCASE[JOINEDCASE["JOINEDWHILEMATCHMAKING"] = 2] = "JOINEDWHILEMATCHMAKING";
})(JOINEDCASE = exports.JOINEDCASE || (exports.JOINEDCASE = {}));
var PLAYERSTATE;
(function (PLAYERSTATE) {
    PLAYERSTATE[PLAYERSTATE["INGAME"] = 0] = "INGAME";
    PLAYERSTATE[PLAYERSTATE["WAITING"] = 1] = "WAITING";
    PLAYERSTATE[PLAYERSTATE["DROPPED"] = 2] = "DROPPED";
    PLAYERSTATE[PLAYERSTATE["LEFT"] = 3] = "LEFT";
})(PLAYERSTATE = exports.PLAYERSTATE || (exports.PLAYERSTATE = {}));
var GAMESTATE;
(function (GAMESTATE) {
    GAMESTATE[GAMESTATE["MATCHMAKING"] = 0] = "MATCHMAKING";
    GAMESTATE[GAMESTATE["TOSS"] = 1] = "TOSS";
    GAMESTATE[GAMESTATE["INGAME"] = 2] = "INGAME";
    GAMESTATE[GAMESTATE["FINISHING"] = 3] = "FINISHING";
    GAMESTATE[GAMESTATE["SUBMITING"] = 4] = "SUBMITING";
    GAMESTATE[GAMESTATE["RESULT"] = 5] = "RESULT";
    GAMESTATE[GAMESTATE["RESTARTING"] = 6] = "RESTARTING";
})(GAMESTATE = exports.GAMESTATE || (exports.GAMESTATE = {}));
function ConvertTextToBase64(text) {
    return Buffer.from(text).toString('base64');
}
exports.ConvertTextToBase64 = ConvertTextToBase64;
function ConvertBase64ToText(base64) {
    return Buffer.from(base64, 'base64').toString('ascii');
}
exports.ConvertBase64ToText = ConvertBase64ToText;
var MSGTYPE;
(function (MSGTYPE) {
    MSGTYPE["JOINED"] = "joined";
    MSGTYPE["PADD"] = "pAdd";
    MSGTYPE["PLEFT"] = "pLeft";
    MSGTYPE["PLCARDSMSG"] = "plCardsMsg";
    MSGTYPE["JOKERCARDMSG"] = "jokerCardMsg";
    MSGTYPE["OPENDECKCARDMSG"] = "openDeckCardMsg";
    MSGTYPE["TOSSRESULTMSG"] = "tossResultMsg";
    MSGTYPE["CARDPICKCLICKMSG"] = "cardPickClickMsg";
    MSGTYPE["CARDPICKRESPONSEMSG"] = "cardPickResponse";
    MSGTYPE["CARDDISCARDMSG"] = "cardDiscardMsg";
    MSGTYPE["NEXTPLAYERTURNMSG"] = "nextPlayerTurnMsg";
    MSGTYPE["FINISHGAMEMSG"] = "finishGameMsg";
    MSGTYPE["DECLAREMSG"] = "declareMsg";
    MSGTYPE["SUBMITMSG"] = "submitMsg";
    MSGTYPE["RESULTMSG"] = "resultMsg";
    MSGTYPE["TIMER"] = "timer";
    // TURNTIMER = "turnTimer",
    MSGTYPE["TURNSKIPPED"] = "turnSkipped";
    // GAMESTART = "gameStart",
    // THREESIX = "threeSix",
    // GAMEENDED = "gameEnded",
    // INVALIDMOVE = "invalidMove",
    MSGTYPE["WAITTIMER"] = "waitTimer";
    // THREESKIPS = "threeSkips",
    MSGTYPE["ERROR"] = "error";
    MSGTYPE["THREESKIPS"] = "THREESKIPS";
    MSGTYPE["GAMESTARTMSG"] = "GAMESTARTMSG";
    MSGTYPE["PREJOIN"] = "plRejoin";
    MSGTYPE["REJOINED"] = "rejoined";
})(MSGTYPE = exports.MSGTYPE || (exports.MSGTYPE = {}));
//# sourceMappingURL=Utils.js.map