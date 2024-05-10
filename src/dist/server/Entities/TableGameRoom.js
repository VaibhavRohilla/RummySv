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
exports.TableGameRoom = void 0;
const timers_1 = require("timers");
const apicalls_1 = require("../apicalls");
const DataTypes_1 = require("../DataTypes");
const server_1 = require("../server");
const Card_1 = require("./Card");
const GameState_1 = require("./GameStates/GameState");
const LoggingHandler_1 = require("./LoggingHandler");
const logUtils_1 = require("./logUtils");
const RemoveRequest_1 = require("./RemoveRequest");
const Utils_1 = require("./Utils");
class TableGameRoom {
    constructor(tableGameId) {
        this.tableGameId = tableGameId;
        this.turnTimeVal = 30;
        this.turnTimer = this.turnTimeVal;
        this.extraTimeVal = 2;
        this.extraTimer = this.extraTimeVal;
        this.waitTimerVal = 10;
        this.waitTimer = this.waitTimerVal;
        this.minPlayers = 2;
        this.maxPlayers = 6;
        this.PlayersUniqIdDict = {};
        //these are players who are disconnected from game -- these will be able to come back. 
        //internet disconnected
        // public TempLeftPlayerUniqIdDict: { [id: string]: Player; } = {};
        this.PermaLeftPlayerUniqIdDict = {};
        this.playersIdOnHold = [];
        //connected but cannot play //Clicked on Drop 
        // public Board: Board = new Board();
        this.ClosedDeck = [];
        this.OpenDeck = [];
        //to check who is going to declare / submit cards.
        this.declarePlId = -1;
        // gameShouldEndNow: boolean = false;
        // public pointVal: number = 0.1;
        this.winner = -1;
        this.handleTossTimeout = undefined;
        // gameState : GAMESTATE = GAMESTATE.MATCHMAKING;
        this.gameStateHandler = new GameState_1.GameStateHandler(this); //this is the current state handler and by default it is the matchmaking state handle
        this.calculatedResult = undefined;
        this.canDiscardCard = false;
        this.currentGameRoundId = '';
        this.stopRestart = false;
        this.entryFees = 0;
        this.pointsVal = 0;
        this.removeRequestHandler = new RemoveRequest_1.RemoveRequestQueue(this);
        this.currentPlayersCount = 0;
        this.isGameEnded = false;
        this.isWaitingForRestart = false;
        this.restartTimeout = undefined;
        // gamePlayTimer: any = this.gameTimerVal;
        this.gameStarted = false;
        // getFirstPlayerId() {
        //     for (let i = 0; i < this.maxPlayers; i++)
        //         if (this.PlayersUniqIdDict[i] != null)
        //             return i;
        //     return -1;
        // }
        this.potDistribution = 0;
        (0, LoggingHandler_1.TableLogInit)(this);
        (0, LoggingHandler_1.LogMessage)("Table Created", this);
        this.createShuffledCardDeck();
    }
    setTableTypeProperties(tableType) {
        this.tableTypeID = tableType.toString();
        this.entryFees = server_1.TableTypesDict[tableType].entryFee;
        this.pointsVal = server_1.TableTypesDict[tableType].onePointValue;
    }
    shuffle(array) {
        let currentIndex = array.length, randomIndex;
        // While there remain elements to shuffle...
        while (currentIndex != 0) {
            // Pick a remaining element...
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            // And swap it with the current element.
            [array[currentIndex], array[randomIndex]] = [
                array[randomIndex], array[currentIndex]
            ];
        }
        return array;
    }
    addPlayerToRoom(pl, playerBal) {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, void 0, function* () {
            (0, LoggingHandler_1.LogMessage)(`Adding Player ${pl.playerID} to table`, this);
            let plIndex = -1;
            for (let i = 0; i < this.maxPlayers; i++) {
                if (this.PlayersUniqIdDict[i] && this.PlayersUniqIdDict[i].playerID == pl.playerID) {
                    plIndex = i;
                    break;
                }
            }
            let isPlDisconnected = false;
            if (plIndex == -1) {
                for (let i = 0; i < this.maxPlayers; i++) {
                    if (this.PlayersUniqIdDict[i] && this.PlayersUniqIdDict[i].playerID == pl.playerID) {
                        (0, LoggingHandler_1.LogMessage)(`Player ${pl.playerID} is already in room`, this);
                        (0, LoggingHandler_1.LogMessage)("Closing socket because player is already in room", this);
                        console.log("Closing socket because player is already in room " + pl.playerID);
                        if (pl && pl.plSocket && pl.plSocket.isConnectionAlive) {
                            pl.sendMessage({
                                t: Utils_1.MSGTYPE.ERROR,
                                data: `You are already in room`,
                                showMessage: true
                            });
                            try {
                                (_a = pl.plSocket) === null || _a === void 0 ? void 0 : _a.end();
                            }
                            catch (_e) {
                                console.log("error in closing socket");
                            }
                        }
                        return;
                    }
                }
            }
            if (this.currentPlayersCount == this.maxPlayers || this.gameStarted) {
                //kicking player out 
                (0, logUtils_1.LogErrorToDB)({
                    functionName: "addPlayerToRoom",
                    reason: "Unable to join full or game started table",
                    properties: { playerID: pl.playerID, cTID: this.tableGameId },
                    time: new Date(),
                    servId: process.env.SERVERID,
                    errorCode: Utils_1.ErrorCode.FULL_TABLE
                });
                CallUpdatePlayerStatus(parseInt(pl.playerID), GlobalPlayerState.IN_APP, "", -1, -1); //need to add this function in api Calls
                console.log("sending pl the unable to join msg " + pl.playerID);
                if (pl && pl.plSocket && pl.plSocket.isConnectionAlive) {
                    pl.sendMessage({ t: Utils_1.MSGTYPE.ERROR, data: `Unable to join table, Error Code : ${Utils_1.ErrorCode.FULL_TABLE}`, code: Utils_1.ErrorCode.FULL_TABLE });
                    (_b = pl.plSocket) === null || _b === void 0 ? void 0 : _b.end();
                }
                try {
                    (_c = pl.plSocket) === null || _c === void 0 ? void 0 : _c.end();
                }
                catch (e) {
                    //log in error stream
                    console.log(e);
                    console.log("Error while closing socket");
                }
                console.log("This table is already full cant join : " + Utils_1.ErrorCode.FULL_TABLE);
                return;
            }
            this.currentPlayersCount++;
            console.log(" Before Locking Current Players Count : " + this.currentPlayersCount);
            const lockFunds = yield (0, apicalls_1.CallLockFundsAPI)(pl.playerID, playerBal, this.currentGameRoundId, true, pl.hasDeposited, undefined);
            if (!lockFunds.success) {
                console.log("Lock Funds Failed");
                (0, LoggingHandler_1.LogMessage)("Lock Funds Failed", this, pl);
                this.currentPlayersCount--;
                CallUpdatePlayerStatus(parseInt(pl.playerID), GlobalPlayerState.IN_APP, "", -1, -1); //function missing in api calls
                console.log("Closing socket because lock funds failed");
                if (pl && pl.plSocket && pl.plSocket.isConnectionAlive) {
                    pl.sendMessage({
                        t: Utils_1.MSGTYPE.ERROR,
                        data: `Unable to join table,\n ${lockFunds.data}`,
                    });
                    try {
                        (_d = pl.plSocket) === null || _d === void 0 ? void 0 : _d.end();
                    }
                    catch (e) {
                        console.log("Error while ending socket in line 217");
                    }
                }
                return;
            }
            if (plIndex != -1) {
                const player = this.PlayersUniqIdDict[plIndex];
                player.isDisconnected = false;
                pl.plSocket.player = player;
                player.plSocket = pl.plSocket;
                (0, LoggingHandler_1.LogMessage)(`Player ${pl.playerID} reconnected`, this);
                this.handleRejoinPlayer(player, playerBal); //need to modify player rejpinh function
                return;
            }
            for (let i = 0; i < this.maxPlayers; i++) {
                if (this.PlayersUniqIdDict[i] != null) {
                    if (this.PlayersUniqIdDict[i].playerID == pl.playerID) {
                        console.log("This player is already joined");
                        (0, LoggingHandler_1.LogMessage)(`Player with ${pl.playerID} is already joined!`, this);
                        this.currentPlayersCount--;
                        return;
                    }
                }
            }
            if ((!pl) || (!pl.plSocket) || (!pl.plSocket.isConnectionAlive)) {
                if (!pl)
                    (0, LoggingHandler_1.LogMessage)(`Kicking Player, Reason : player is null`, this);
                else if (!pl.plSocket)
                    (0, LoggingHandler_1.LogMessage)(`Kicking ${pl.playerID}, Reason : player socket is null`, this);
                else if (!pl.plSocket.isConnectionAlive)
                    (0, LoggingHandler_1.LogMessage)(`Kicking ${pl.playerID}, Reason : socket not alive`, this);
                // CallLeftPlayerAPI(this.tableGameId, pl.playerID, RemovePlayerEvent.ERRORED);
                //Calling UnLockFundsAPI to unlock the funds of player as It is locked while createNewPlayerFunction in server.ts
                yield (0, apicalls_1.CallLockFundsAPI)(pl.playerID, this.entryFees, this.currentGameRoundId, false, pl.hasDeposited, "Errored while joining table");
                CallUpdatePlayerStatus(parseInt(pl.playerID), GlobalPlayerState.IN_APP, "", -1, -1); //missing function in api calls
                this.currentPlayersCount--;
                return;
            }
            this.handleJoinPlayer(pl, playerBal); //Need to add this 
            //this.currentPlayersCount++;
            (0, timers_1.clearTimeout)(this.deleteTableTimeout);
            this.waitTimer = this.waitTimerVal;
            //if current players equal minimum players then start 15 second countdown to start the game.
            console.log("Current Players Count : " + this.currentPlayersCount);
            if (this.currentPlayersCount >= 1) {
                console.log("################# Restarting Wait Timer  Curr Pls:" + this.currentPlayersCount + "###################");
                if (!this.gameStarted) {
                    //above check added as the timer was getting started twice in case of player's lock funds success coming at the moment 3,2,1 was started already
                    (0, timers_1.clearTimeout)(this.waitTimeout);
                    //TLDR this should not get started twice in case of player leaves and joins
                    this.waitTimeout = setTimeout(this.waitTimerLoop.bind(this), 1000);
                }
            }
            console.log("Adding Pl to room =======");
            (0, LoggingHandler_1.LogMessage)(`Adding player ${pl.playerID} to room`, this);
        });
    }
    handleRejoinPlayer(pl, playerBal) {
        //Only dropped or in game players can rejoin
        if (pl.playerState != Utils_1.PLAYERSTATE.DROPPED && pl.playerState != Utils_1.PLAYERSTATE.INGAME) {
            (0, apicalls_1.sendToAnalytics)({
                collection: apicalls_1.DBCollectionNames.UnexpectedErrors,
                data: {
                    type: "PlayerNotInDroppedORInGame",
                    playerID: pl.playerID,
                    tableID: this.tableGameId,
                    gameRoundId: this.currentGameRoundId,
                    time: new Date()
                }
            });
            (0, LoggingHandler_1.LogMessage)(`Player ${pl.playerID} is not in dropped or ingame state`, this, pl);
            return;
        }
        let pRejoinedMsg = {
            t: Utils_1.MSGTYPE.PREJOIN,
            plId: pl.plRoomNetId,
            pImage: pl.plImage,
            pName: pl.plName,
            bal: pl.balance,
            pState: pl.playerState,
            pDefaultId: pl.playerID
        };
        let reJoinMsg = {
            t: Utils_1.MSGTYPE.REJOINED,
            plId: pl.plRoomNetId,
            bal: pl.balance,
            joker: this.jokerCard ? this.jokerCard.name : undefined,
            tId: this.tableGameId,
            openCard: this.OpenDeck.length > 0 ? this.OpenDeck[this.OpenDeck.length - 1].name : undefined,
            pot: this.potDistribution,
            cards: pl.cardFormationString,
            lives: pl.skippedTurns,
            hasSubmit: pl.hasSubmitted,
            snap: this.getRoomSnap()
        };
        pl.sendUpdatedGID();
        // if(pl.playerState == PLAYERSTATE.DROPPED)
        // {
        //     reJoinMsg.gameState = (this.gameStateHandler.GetState == GAMESTATE.RESTARTING) ? GAMESTATE.RESTARTING : GAMESTATE.RESULT;
        // } else
        reJoinMsg.gameState = this.gameStateHandler.GetState;
        switch (reJoinMsg.gameState) {
            case Utils_1.GAMESTATE.FINISHING:
                reJoinMsg.aData = {
                    plId: this.declarePlId,
                    timeLeft: this.PlayersUniqIdDict[this.declarePlId].finalTurnTimeoutKeeper.getRemainingTime
                };
                break;
            case Utils_1.GAMESTATE.SUBMITING:
                let playerCards = [];
                for (let i = 0; i < this.maxPlayers; i++) {
                    if (this.PlayersUniqIdDict[i] && this.PlayersUniqIdDict[i].hasSubmitted) {
                        playerCards[i] = {
                            plId: i,
                            Gresult: this.PlayersUniqIdDict[i].result,
                            amount: 0,
                            score: 0,
                            cards: this.PlayersUniqIdDict[i].cardFormationString
                        };
                    }
                }
                reJoinMsg.aData = {
                    plId: this.declarePlId,
                    timeLeft: this.PlayersUniqIdDict[pl.plRoomNetId].finalTurnTimeoutKeeper.getRemainingTime,
                    submitCards: playerCards,
                    validData: {
                        plId: this.declarePlId,
                        result: "Won",
                        score: 0,
                        amount: 0,
                        cards: this.PlayersUniqIdDict[this.declarePlId].cardFormationString
                    }
                };
                break;
            case Utils_1.GAMESTATE.RESULT:
                if (this.calculatedResult) {
                    reJoinMsg.aData = this.calculatedResult;
                }
                break;
            case Utils_1.GAMESTATE.RESTARTING:
                reJoinMsg.aData = this.calculatedResult;
                break;
        }
        (0, LoggingHandler_1.LogMessage)(`[${pl.playerID}]:` + "Sending Rejoin Message to player " + pl.plRoomNetId + " " + pl.plName, this, pl);
        pl.infoLog(`Rejoin Room`, { rejoinMsg: reJoinMsg });
        pl.sendMessage(reJoinMsg);
        this.sendMessageToOthers(pRejoinedMsg, pl.plRoomNetId);
        console.log("Rejoining Player ---- " + pl.plRoomNetId);
    }
    checkReconnectAvailability(plId) {
        return this.PlayersUniqIdDict[plId] && this.PlayersUniqIdDict[plId].isDisconnected && !this.isGameEnded;
    }
    reconnectDroppedPlayer(plId, wsSocket) {
        console.log("Reconnecting Attempt 1");
        this.PlayersUniqIdDict[plId].isDisconnected = false;
        wsSocket.player = this.PlayersUniqIdDict[plId];
        this.PlayersUniqIdDict[plId].plSocket = wsSocket;
        this.handleRejoinPlayer(this.PlayersUniqIdDict[plId]);
        //if in blacklist ---> join as dropped player
        //else
        //if in tempLeft && threeTurnSkipped then send --> join as dropped player
        //else
        // if player can be joined immediately ---> send sync messsage 
        //else send cannot join now msg --> will try to reconnect after 5s
        //Remember to remove the player from tempLeftList
    }
    sendUpdatedGID() {
        const id = this.tableGameId + (this.currentGameRoundId.length > 0 ? "_" + this.currentGameRoundId : "");
        this.sendMessageToAll({
            t: "gId",
            gId: (0, Utils_1.ConvertTextToBase64)(id)
        });
    }
    handleAddPlayer(pl, joinedCase) {
        let playerAddedMsg = {
            t: Utils_1.MSGTYPE.PADD,
            plId: pl.plRoomNetId,
            pImage: pl.plImage,
            pName: pl.plName,
            bal: pl.balance,
            currState: pl.playerState,
            pDefaultId: pl.playerID
        };
        let joinedMsg = {
            t: Utils_1.MSGTYPE.JOINED,
            plId: pl.plRoomNetId,
            bal: pl.balance,
            tId: this.tableGameId,
            snap: this.getRoomSnap(),
            gameState: this.gameStateHandler.GetState
        };
        pl.sendUpdatedGID();
        if (joinedCase == Utils_1.JOINEDCASE.JOINEDWHILEGAMESTARTED) {
            joinedMsg.gameStarted = true;
            joinedMsg.joker = this.jokerCard.name;
            joinedMsg.openCard = (this.OpenDeck.length > 0) ? this.OpenDeck[this.OpenDeck.length - 1].name : null;
            joinedMsg.pot = this.potDistribution;
        }
        if (joinedCase == Utils_1.JOINEDCASE.JOINEDWHILETOSS) {
            joinedMsg.gameStarted = true;
        }
        (0, LoggingHandler_1.LogMessage)(`[${pl.playerID}] : ` + "Sending Joined Message to player " + pl.plRoomNetId + " " + pl.plName, this, pl);
        pl.infoLog(`Joined Room`, { joinMsg: joinedMsg });
        pl.sendMessage(joinedMsg);
        this.sendMessageToOthers(playerAddedMsg, pl.plRoomNetId);
        this.currentPlayersCount++;
        if (joinedCase == Utils_1.JOINEDCASE.JOINEDWHILEMATCHMAKING) {
            if (this.deleteTableTimeout != undefined) {
                (0, timers_1.clearTimeout)(this.deleteTableTimeout);
                this.deleteTableTimeout = undefined;
                if (this.gameStateHandler.GetState == Utils_1.GAMESTATE.RESULT) {
                    this.gameStateHandler.SetState(Utils_1.GAMESTATE.RESTARTING);
                    this.isWaitingForRestart = true;
                    this.restartTimeout = setTimeout(() => {
                        this.restartGame();
                    }, 5000);
                }
            }
            this.waitTimer = this.waitTimerVal;
            //if current players equal minimum players then start 15 second countdown to start the game.
            if (this.currentPlayersCount == 1) {
                //    console.log("Starting Wait timer AGAIN!!")
                (0, timers_1.clearTimeout)(this.waitTimeout);
                //TLDR this should not get started twice in case of player leaves and joins
                this.waitTimeout = setTimeout(this.waitTimerLoop.bind(this), 1000);
            }
        }
        console.log("Adding Pl to room =======");
    }
    startTheGame() {
        return __awaiter(this, void 0, void 0, function* () {
            (0, LoggingHandler_1.LogMessage)("Starting the game...", this);
            const playerIds = [];
            for (let i = 0; i < this.maxPlayers; i++) {
                if (this.PlayersUniqIdDict[i]) {
                    playerIds.push(this.PlayersUniqIdDict[i].playerID);
                }
            }
            const startResult = yield sendGameStartedAlert(this.tableGameId, playerIds);
            if (!startResult) {
                this.closeTable("Starting Game Failed", "Enable to mark game started on MS", true);
                return;
            }
            (0, LoggingHandler_1.LogMessage)("New Round Id : " + startResult.gameRoundId, this);
            this.setTableTypeProperties(startResult.tableTypeId);
            this.currentGameRoundId = startResult.gameRoundId;
            this.sendUpdatedGID();
            (0, LoggingHandler_1.LogInit)(this);
            (0, LoggingHandler_1.LogMessage)(`New Session Id Generated : ${this.currentGameRoundId}`, this);
            this.currentGameRoundReport = {
                tableId: this.tableGameId,
                gameRoundId: this.currentGameRoundId,
                startTime: new Date(),
                endTime: undefined,
                players: [],
                waitingPlayers: [],
                result: {},
                gameData: {
                    joker: '',
                },
                isEndedCleanly: true,
                reason: undefined
            };
            (0, LoggingHandler_1.LogMessage)(JSON.stringify(this.currentGameRoundReport), this);
            (0, logUtils_1.LogGameStateToDB)(logUtils_1.LogGameStates.GAME_STARTED, this);
            for (let i = 0; i < this.maxPlayers; i++) {
                let pl = this.PlayersUniqIdDict[i];
                if (pl) {
                    this.currentGameRoundReport.players.push(pl.playerID);
                }
            }
            this.startRummy();
        });
    }
    handleSwitchTable(pl) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.stopRestart) {
                console.log("Switch table cancelled because Server is going to turn off : " + this.tableGameId);
                pl.sendMessage({
                    t: "switchFailed",
                    reason: "Server is going to turn off"
                });
                return;
            }
            if (this.gameStateHandler.GetState != Utils_1.GAMESTATE.MATCHMAKING && pl.playerState != Utils_1.PLAYERSTATE.WAITING) {
                pl.sendMessage({
                    t: "switchFailed",
                    reason: "Game is already started"
                });
                return;
            }
            else if (this.gameStateHandler.GetState == Utils_1.GAMESTATE.MATCHMAKING && this.waitTimer <= 3) {
                console.log("Switch table cancelled because game is already started : " + this.tableGameId);
                pl.sendMessage({
                    t: "switchFailed",
                    reason: "Game is about to start"
                });
                return;
            }
            (0, LoggingHandler_1.LogMessage)(`[${pl.playerID}] : ` + "Switching Table", this, pl);
            let result = yield CallRemoveForSwitch(pl.playerID);
            if (result == null) {
                console.log("Switch Table API failed");
                pl.sendMessage({
                    t: "switchFailed"
                });
                return;
            }
            pl.sendMessage({
                t: "switchSuccess",
                oldTableGameId: result.tableGameId.toString(),
            });
            pl.playerState = Utils_1.PLAYERSTATE.LEFT;
            delete this.PlayersUniqIdDict[pl.plRoomNetId];
            this.currentPlayersCount--;
            pl.plSocket.close();
            this.sendMessageToAll({ t: Utils_1.MSGTYPE.PLEFT, data: pl.plRoomNetId, state: pl.playerState });
            (0, apicalls_1.sendToAnalytics)({
                collection: apicalls_1.DBCollectionNames.GAME_EVENTS,
                data: {
                    type: "switchTable",
                    playerId: pl.playerID,
                    tableId: this.tableGameId,
                    time: new Date()
                }
            });
            (0, LoggingHandler_1.LogMessage)(`[${pl.playerID}] : ` + "Player Switched Table", this, pl);
            this.checkIfNeedToEndGame();
        });
    }
    handleChargePlayer(pl, amount, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            amount = Math.trunc((amount * 100)) / 100;
            console.log("CHARGING " + pl.playerID + " " + (-1 * amount).toString() + " REASON = " + reason);
            (0, LoggingHandler_1.LogMessage)("CHARGING " + (-1 * amount).toString() + " REASON = " + reason, this, pl);
            pl.isCharged = true;
            let result = yield CallDeductBalanceAPI(amount.toString(), pl.playerID, this.tableGameId, reason, this.currentGameRoundId, Utils_1.TxReasons.LOSE);
            if (result) {
                console.log("Adding to potDistribution " + amount);
                this.potDistribution += amount;
                (0, LoggingHandler_1.LogMessage)("Adding to potDistribution " + amount, this, pl);
                (0, LoggingHandler_1.LogMessage)("Pot Distribution : " + this.potDistribution, this, pl);
                pl.balance = result.balance;
                this.sendMessageToAll({
                    t: "potUpdate", amt: this.potDistribution, data: {
                        plId: pl.plRoomNetId,
                        bal: pl.balance
                    }
                });
                pl.infoLog("Charged", { amount: amount, reason: reason, balance: pl.balance, potDistribution: this.potDistribution });
                (0, logUtils_1.LogGameStateToDB)(logUtils_1.LogGameStates.MONEY_DEDUCTED, this, { playerID: pl.playerID, amount: amount, isSuccess: true });
            }
            else {
                this.currentGameRoundReport.isEndedCleanly = false;
                (0, logUtils_1.LogGameStateToDB)(logUtils_1.LogGameStates.MONEY_DEDUCTED, this, { playerID: pl.playerID, amount: amount, isSuccess: false });
                (0, logUtils_1.LogBalanceDeductFail)("Charge Amount", pl.playerID, this.tableGameId, this.currentGameRoundId, amount);
            }
        });
    }
    handleRewardPlayer(pl, amount, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("REWARDING " + pl.playerID + "  " + (amount).toString() + " REASON = " + reason);
            (0, LoggingHandler_1.LogMessage)("REWARDING " + (amount).toString() + " REASON = " + reason, this, pl);
            pl.isCharged = true;
            let result = yield CallCreditBalanceAPI(amount.toString(), pl.playerID, this.tableGameId, this.currentGameRoundId, Utils_1.TxReasons.WIN);
            if (result != undefined && result != null) {
                this.potDistribution -= amount;
                pl.balance = result.balance;
                pl.reward = amount - result.rake;
                this.sendMessageToAll({
                    t: "potUpdate", amt: this.potDistribution, data: {
                        plId: pl.plRoomNetId,
                        bal: pl.balance
                    }
                });
                pl.infoLog("Rewarded", { amount: amount, reason: reason, balance: pl.balance, potDistribution: this.potDistribution });
                (0, logUtils_1.LogGameStateToDB)(logUtils_1.LogGameStates.MONEY_CREDITED, this, { playerID: pl.playerID, amount: pl.reward, isSuccess: true });
                return result.rake;
            }
            else {
                this.currentGameRoundReport.isEndedCleanly = false;
                (0, logUtils_1.LogGameStateToDB)(logUtils_1.LogGameStates.MONEY_CREDITED, this, { playerID: pl.playerID, amount: amount, isSuccess: false });
                return null;
            }
        });
    }
    handlePlayerClickLeaver(pl) {
        // if(pl.playerState == PLAYERSTATE.WAITING || !this.gameStarted)
        // {
        // } else
        // {
        //     this.addToPermaLeft(pl);
        // }
        // LogMessage("Player Clicked Leaver", this, pl);
        pl.infoLog("Player Clicked Leaver", { playerState: pl.playerState, gameStarted: this.gameStarted });
        const removeReq = new RemoveRequest_1.RemoveRequest(pl, DataTypes_1.LeaveState.LEAVE_CLICKED);
        this.removeRequestHandler.AddRequest(removeReq);
        // this.removePlayerFromRoom(pl, RemovePlayerEvent.LEFT);
        // this.sendMessageToAll({ t: MSGTYPE.PLEFT, data: pl.plRoomNetId })
    }
    addToPermaLeft(pl) {
        this.PermaLeftPlayerUniqIdDict[pl.plRoomNetId] = pl;
    }
    // sendErrorToPlayer(pl: Player, error: ErrorMessage, code : ErrorCode | undefined = undefined, kickData : {reason : RemovePlayerEvent} | undefined = undefined)
    // {
    //     let message : string = error;
    //     if(code)
    //     {
    //         message = message + " Error Code : " + code;
    //     }
    //     pl.sendMessage({
    //         t : "error",
    //         msg : message
    //     });
    //     LogMessage("Sending Error to Player : " + message, this, pl);
    //     if(kickData)
    //     {
    //         this.removePlayerFromRoom(pl, kickData.reason);
    //     }
    // }
    onSocketClose(pl) {
        (0, LoggingHandler_1.LogMessage)("Socket Closed", this, pl);
        const removeReq = new RemoveRequest_1.RemoveRequest(pl, DataTypes_1.LeaveState.WS_DISCONNECT);
        this.removeRequestHandler.AddRequest(removeReq);
        // if(pl.playerState == PLAYERSTATE.WAITING || this.gameStateHandler.GetState == GAMESTATE.MATCHMAKING)
        // {
        //     //remove player  as permaleft from room
        //     this.removePlayerFromRoom(pl, RemovePlayerEvent.LEFT);
        // } else
        // {
        //     this.disconnectPlayerFromRoom(pl)
        //     //remove player as disconnected
        // }
    }
    // disconnectPlayerFromRoom(pl : Player)
    // {
    //     LogMessage("Player Disconnected", this, pl); 
    //     if(pl.isDisconnected || pl.playerState == PLAYERSTATE.LEFT || pl.plSocket == null)
    //     { // if player is already disconnected
    //         LogMessage("Player is already disconnected / left", this, pl);
    //         return;
    //     }
    //     pl.isDisconnected = true;
    //     this.sendMessageToAll({
    //         t : MSGTYPE.PLEFT,
    //         data : pl.plRoomNetId,
    //         state : pl.playerState
    //     });
    //     pl.plSocket = null;
    //     this.checkPlayerRemovalCondition(pl, RemovePlayerEvent.DISCONNECTED);
    // }
    // removePlayerFromRoom(pl: Player, removeEvent : RemovePlayerEvent) 
    // {
    //     LogMessage(`Removing player=${pl.playerID} from room with removeEvent=${removeEvent}`, this, pl); 
    //     if(pl.playerState == PLAYERSTATE.LEFT)
    //     {
    //         sendToAnalytics({
    //             collection : DBCollectionNames.UnexpectedErrors,
    //             data : {
    //                 type : "PlayerAlreadyLeft",
    //                 playerId : pl.playerID,
    //                 tableGameId : this.tableGameId,
    //                 gameRoundId : this.currentGameRoundId,
    //                 time : new Date()
    //             }
    //         });
    //         return;
    //     }
    //     // if(pl.playerState != PLAYERSTATE.DROPPED)
    //     this.sendMessageToAll({ t: MSGTYPE.PLEFT, data: pl.plRoomNetId, state : pl.playerState});
    //     if(pl.playerState != PLAYERSTATE.WAITING)
    //         pl.playerState = PLAYERSTATE.LEFT;
    //     delete this.PlayersUniqIdDict[pl.plRoomNetId];
    //     this.currentPlayersCount--;
    //     if(removeEvent == RemovePlayerEvent.DISCONNECTED)
    //         removeEvent = RemovePlayerEvent.LEFT;
    //     LogMessage(`Closing Socket for player=${pl.playerID} with removeEvent=${removeEvent}`, this, pl); 
    //     try
    //     {
    //         if(pl.plSocket && pl.plSocket.isConnectionAlive)
    //             pl.plSocket.close();
    //     } catch(e)
    //     {
    //         LogMessage("Error while closing socket", this, pl);
    //         sendToAnalytics({
    //             collection : DBCollectionNames.UnexpectedErrors,
    //             data : {
    //                 type : "ErrorWhileClosingSocket",
    //                 msg : "Error in closing socket while removing player from room",
    //                 playerId : pl.playerID,
    //                 tableGameId : this.tableGameId,
    //                 gameRoundId : this.currentGameRoundId,
    //                 time : new Date()
    //             }});
    //     }
    //     LogMessage(`Socket Closed for player=${pl.playerID} with removeEvent=${removeEvent}`, this, pl);
    //     this.checkPlayerRemovalCondition(pl, removeEvent); 
    //     //should be called at game end!
    // }
    // checkPlayerRemovalCondition(pl : Player, removeEvent : RemovePlayerEvent)
    // {
    //     LogMessage(`Checking player removal condition for player=${pl.playerID} with removeEvent=${removeEvent}`, this, pl);
    //     if (pl.hasSubmitted)
    //     {
    //         console.log("all good throw him out")
    //         if (pl.result != "win")
    //         {
    //             CallLeftPlayerAPI(this.tableGameId, pl.playerID, removeEvent);
    //             // callPlayerLeftTableAPI(GamesappGameId, pl.playerID, pl.tableGameID, this.currentGameRoundId)
    //         } else
    //         {
    //             LogMessage("Player Won, Not Calling Left Player API", this, pl);
    //             // pl.isDisconnected = true;
    //             // pl.playerState = PLAYERSTATE.LEFT;
    //         }
    //     } else if (pl.isBlacklisted)
    //     {   //To Check
    //         if(pl.playerState == PLAYERSTATE.WAITING)
    //         {
    //             LogMessage(`Player is blacklisted and waiting, not calling DeductBalanceAPI for player=${pl.playerID} with removeEvent=${removeEvent}`, this, pl);
    //             this.handlePlayerRemoval(pl, LEAVECASE.LEFTWITHPERMALEFT, removeEvent);
    //             // callPlayerLeftTableAPI(GamesappGameId, pl.playerID, pl.tableGameID)
    //             console.log("Waiting Player Left");
    //         } else
    //         {
    //             this.handlePlayerRemoval(pl, LEAVECASE.LEFTWHILEDROPPED, removeEvent);
    //         }
    //         console.log("Dropped Player Left");
    //     } else {
    //         //submit or declare here forcefully
    //         if (pl.finalTurnTimeout != null) {   // should be only when final turntimeout is going
    //             if (pl.plRoomNetId == this.declarePlId) {
    //                 this.handlePlayerRemoval(pl, LEAVECASE.LEFTINGAME, removeEvent)
    //             } else {
    //                 this.handlePlayerRemoval(pl, LEAVECASE.LEFTWHILESUBMIT, removeEvent)
    //             }
    //         } else {
    //             if (!this.gameStarted && !this.isGameEnded) {
    //                 this.handlePlayerRemoval(pl, LEAVECASE.LEFTWHILEMATCHING, removeEvent)
    //             } else {
    //                 if (!this.gameStarted)
    //                     this.handlePlayerRemoval(pl, LEAVECASE.LEFTWHILEMATCHING, removeEvent)
    //                 else
    //                     this.handlePlayerRemoval(pl, LEAVECASE.LEFTINGAME, removeEvent)
    //             }
    //         }
    //     }
    // }
    // async handlePlayerRemoval(pl: Player, leftcase: LEAVECASE, removeEvent : RemovePlayerEvent)
    // {
    //     LogMessage("Player"+pl.playerID+" Removed with " + leftcase + ` , removeEvent=${removeEvent}`, this, pl); 
    //     if (leftcase == LEAVECASE.LEFTINGAME) {            
    //         if (pl.playerState == PLAYERSTATE.LEFT && !pl.isCharged ) {
    //             pl.result = "lost";
    //             pl.lostPoints = 80;
    //             await this.handleChargePlayer(pl, pl.lostPoints * this.pointsVal, "Player Left Game");
    //             pl.readyForResultCalculation = true;
    //         } 
    //     }
    //     else if (leftcase == LEAVECASE.LEFTWHILEMATCHING) {
    //         //do nothing
    //         if(removeEvent == RemovePlayerEvent.DISCONNECTED)
    //         {
    //             sendToAnalytics({
    //                 collection : DBCollectionNames.UnexpectedErrors,
    //                 data : {
    //                     type : "PlayerDisconnectedWhileMatching",
    //                     playerId : pl.playerID,
    //                     tableGameId : this.tableGameId,
    //                     gameRoundId : this.currentGameRoundId,
    //                     time : new Date()
    //             }});
    //             removeEvent = RemovePlayerEvent.LEFT;
    //         }
    //     } 
    //     if(this.restartTimeout != undefined && this.currentPlayersCount == 0)
    //     {
    //         clearTimeout(this.restartTimeout);
    //         this.restartTimeout = undefined;
    //     }
    //     await this.checkIfNeedToEndGame(); 
    //     CallLeftPlayerAPI(this.tableGameId, pl.playerID, removeEvent);
    //     if (this.currentPlayersCount <= 0) {
    //         this.deleteTableTimeout = setTimeout(() => {
    //             // console.log("closing the table")
    //             LogMessage("Closing the table", this);
    //             this.closeTableImmediate(`Current Player Count is ${this.currentPlayersCount}`, false)
    //         }, 5000);
    //     }
    // }
    startDestroyTimer() {
        if (this.currentPlayersCount <= 0) {
            (0, LoggingHandler_1.LogMessage)("Starting Destroy Timer", this);
            this.deleteTableTimeout = setTimeout(() => {
                (0, LoggingHandler_1.LogMessage)("Closing the table", this);
                this.closeTableImmediate(`Current Player Count is ${this.currentPlayersCount}`, false);
            }, 5000);
        }
    }
    checkIfNeedToEndGame() {
        return __awaiter(this, void 0, void 0, function* () {
            (0, LoggingHandler_1.LogMessage)("Checking if need to end game", this);
            if (this.activePlayersCount == 1 && this.gameStarted == true && !this.isGameEnded) // && this.winner == -1)
             {
                (0, LoggingHandler_1.LogMessage)("Ending Game", this);
                yield this.endRummyGame({}, Utils_1.GAMEENDCONDITION.ALLOPPONENTLEFT);
            }
            else {
                (0, LoggingHandler_1.LogMessage)("Not Ending Game", this);
                (0, LoggingHandler_1.LogMessage)("Active Players Count = " + this.activePlayersCount, this);
                (0, LoggingHandler_1.LogMessage)("Game Started = " + this.gameStarted, this);
                (0, LoggingHandler_1.LogMessage)("Is Game Ended = " + this.isGameEnded, this);
                (0, LoggingHandler_1.LogMessage)("Winner = " + this.winner, this);
            }
        });
    }
    performPlayerCountChecks() {
        (0, LoggingHandler_1.LogMessage)("Performing Player Count Checks", this);
        if (this.gameStateHandler.GetState != Utils_1.GAMESTATE.MATCHMAKING && this.gameStateHandler.GetState != Utils_1.GAMESTATE.RESULT && this.gameStateHandler.GetState != Utils_1.GAMESTATE.RESTARTING) {
            this.checkIfNeedToEndGame();
        }
        this.startDestroyTimer();
    }
    endRummyGame(arg0, condition) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, LoggingHandler_1.LogMessage)("Ending Rummy Game", this);
            (0, timers_1.clearTimeout)(this.turnTimeout);
            if (this.handleTossTimeout) {
                (0, timers_1.clearTimeout)(this.handleTossTimeout);
            }
            this.isGameEnded = true;
            let finalPlayerIndex = -1;
            for (let i = 0; i < this.maxPlayers; i++) {
                if (this.PlayersUniqIdDict[i] &&
                    (this.PlayersUniqIdDict[i].playerState == Utils_1.PLAYERSTATE.INGAME) &&
                    !this.PlayersUniqIdDict[i].isBlacklisted) {
                    finalPlayerIndex = i;
                }
            }
            if (finalPlayerIndex > -1) {
                this.sendMessageToAll({ t: "gameEnd", data: condition });
                //this.PlayersUniqIdDict[finalPlayerIndex].sendMessage({ t: "gameEnd", data: condition });
                (0, LoggingHandler_1.LogMessage)("Game Ended with " + condition + " , Making Winner", this, this.PlayersUniqIdDict[finalPlayerIndex]);
                if (this.PlayersUniqIdDict[finalPlayerIndex].finalTurnTimeout) {
                    // @ts-ignore: Unreachable code error
                    (0, timers_1.clearTimeout)(this.PlayersUniqIdDict[finalPlayerIndex].finalTurnTimeout);
                }
                this.winner = finalPlayerIndex;
                this.PlayersUniqIdDict[finalPlayerIndex].result = "win";
                this.PlayersUniqIdDict[finalPlayerIndex].lostPoints = 0;
            }
            yield this.handleResult(condition);
        });
    }
    closeTableImmediate(reason, isErrored) {
        console.log("closing the table method");
        (0, LoggingHandler_1.LogMessage)("Closing the table - " + reason, this);
        //call player left for dropped players
        (0, timers_1.clearTimeout)(this.turnTimeout);
        (0, timers_1.clearTimeout)(this.gamePlayTimeout);
        (0, timers_1.clearTimeout)(this.waitTimeout);
        console.log("closing callEndGameAlertAPI");
        CallCloseTableAPI(this.tableGameId, this.currentGameRoundId, {
            isErrored: isErrored,
            reason: reason
        });
        // callEndGameAlertAPI(this.tableGameId, reason, isErrored)
        console.log("delete from GameRoomsDict");
        delete GameRoomsDict[this.tableGameId];
    }
    closeTable(errorData = "", reason, isErrored) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("closing the table method");
            (0, LoggingHandler_1.LogMessage)("Closing the table - " + reason, this);
            this.sendMessageToAll({ t: Utils_1.MSGTYPE.ERROR, data: errorData });
            (0, timers_1.clearTimeout)(this.turnTimeout);
            (0, timers_1.clearTimeout)(this.gamePlayTimeout);
            (0, timers_1.clearTimeout)(this.waitTimeout);
            console.log("closing callEndGameAlertAPI");
            yield CallCloseTableAPI(this.tableGameId, this.currentGameRoundId, {
                isErrored: isErrored,
                reason: reason
            });
            console.log("delete GameRoomsDict");
            const playerList = this.PlayersUniqIdDict;
            delete GameRoomsDict[this.tableGameId];
            Object.values(playerList).forEach(player => {
                if (player) {
                    const errReq = {
                        msg: "Game Ended",
                        code: Utils_1.ErrorCode.NULL,
                    };
                    const removeReq = new RemoveRequest_1.RemoveRequest(player, DataTypes_1.LeaveState.ERROR, errReq);
                    this.removeRequestHandler.AddRequest(removeReq);
                }
                // this.removePlayerFromRoom(player, RemovePlayerEvent.ERRORED);
                // player.gRoom = null;
            });
        });
    }
    sendMessageToOthers(content, plRoomNetId) {
        for (let i = 0; i < this.maxPlayers; i++)
            if (this.PlayersUniqIdDict[i] != null && i != plRoomNetId && this.PlayersUniqIdDict[i]) {
                this.PlayersUniqIdDict[i].sendMessage(content);
            }
    }
    sendMessageToAll(content) {
        for (let i = 0; i < this.maxPlayers; i++)
            if (this.PlayersUniqIdDict[i] != null)
                this.PlayersUniqIdDict[i].sendMessage(content);
    }
    getRoomSnap(withRoomId = true) {
        // other players with colors , names and profile pic urls
        let snap = [];
        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] != null && this.PlayersUniqIdDict[i]) {
                let msg = { pName: this.PlayersUniqIdDict[i].plName, pImage: this.PlayersUniqIdDict[i].plImage, pBal: this.PlayersUniqIdDict[i].balance, pState: this.PlayersUniqIdDict[i].playerState, pDefaultId: this.PlayersUniqIdDict[i].playerID };
                if (withRoomId) {
                    msg.plId = i;
                }
                snap.push(msg);
            }
        }
        return snap;
    }
    startRummy() {
        (0, LoggingHandler_1.LogMessage)("Game Started", this);
        (0, logUtils_1.LogGameStateToDB)(logUtils_1.LogGameStates.GAME_STARTED, this);
        if (this.currentPlayersCount == 1 || this.activePlayersCount == 1) {
            this.endRummyGame({}, Utils_1.GAMEENDCONDITION.ALLOPPONENTLEFT);
        }
        else {
            this.isGameEnded = false;
            this.gameStarted = true;
            // this.gameState = GAMESTATE.TOSS;
            this.gameStateHandler.SetState(Utils_1.GAMESTATE.TOSS);
            (0, LoggingHandler_1.LogMessage)(`Game State is ${this.gameStateHandler.GetState}`, this);
            let gameStartMsg = {
                t: Utils_1.MSGTYPE.GAMESTARTMSG,
                snap: this.getRoomSnap(true),
                //     turn: this.currPlAtTurn.plRoomNetId,
            };
            for (let i = 0; i < this.maxPlayers; i++)
                if (this.PlayersUniqIdDict[i] != null && !this.PlayersUniqIdDict[i].isBlacklisted) {
                    gameStartMsg.plId = i;
                    this.PlayersUniqIdDict[i].sendMessage(gameStartMsg);
                }
            (0, timers_1.clearTimeout)(this.gamePlayTimeout);
            (0, timers_1.clearTimeout)(this.turnTimeout);
            this.handleTossTimeout = setTimeout(this.handleToss.bind(this), 4000);
        }
    }
    // gamePlayLoop() {
    //     // this.gamePlayTimer--;
    //     // let timerMsg = {
    //     //     t: MSGTYPE.TIMER,
    //     //     data: this.gamePlayTimer
    //     // }
    //     // this.sendMessageToAll(timerMsg)
    //     // if (this.gamePlayTimer == 0) {
    //     //     // here end the game forcefully and declare winner
    //     //     this.gameShouldEndNow = true;
    //     //     console.log("Stopping the game")
    //     // } else {
    //     //     this.gamePlayTimeout = setTimeout(this.gamePlayLoop.bind(this), 1000)
    //     // }
    // }
    handleToss() {
        this.handleTossTimeout = undefined;
        let tossResultMsg = {
            t: Utils_1.MSGTYPE.TOSSRESULTMSG,
            cards: { "0": "", "1": "", "2": "", "3": "", "4": "", "5": "" }
        };
        //pull a card for each player
        let possibleNums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
        let winningPl = { id: -1, cardval: 0 };
        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] != null && !this.PlayersUniqIdDict[i].isBlacklisted) {
                let randIndex = Math.floor(Math.random() * possibleNums.length);
                tossResultMsg.cards[i.toString()] = (possibleNums[randIndex]);
                if (winningPl.cardval < possibleNums[randIndex]) {
                    winningPl.id = i;
                    winningPl.cardval = possibleNums[randIndex];
                }
                possibleNums.splice(randIndex, 1);
            }
        }
        tossResultMsg.winner = winningPl.id;
        (0, LoggingHandler_1.LogMessage)(`Toss Result is ${winningPl.id}`, this);
        this.sendMessageToAll(tossResultMsg);
        console.log("Player win the toss " + winningPl.id);
        try // Added try catch to handle the error of this.PlayersUniqIdDict[winningPl.id] is undefined
         {
            this.currPlAtTurn = this.PlayersUniqIdDict[winningPl.id];
            this.PlayersUniqIdDict[winningPl.id].noOfTurns++;
        }
        catch (e) {
            (0, apicalls_1.sendToAnalytics)({
                collection: apicalls_1.DBCollectionNames.UnexpectedErrors,
                data: {
                    error: e,
                    room: this.tableGameId,
                    msg: "Error in handle toss",
                    gameRoundId: this.currentGameRoundId,
                    winningPl: winningPl,
                    playerId: this.PlayersUniqIdDict[winningPl.id] ? this.PlayersUniqIdDict[winningPl.id].playerID : "null",
                    time: new Date()
                }
            });
            throw e;
        }
        //choosing joker
        let randIndex = Math.floor(Math.random() * this.ClosedDeck.length);
        this.jokerCard = (this.ClosedDeck[randIndex]);
        if (this.jokerCard.name.split("-")[0] == '0') {
            console.log("Assign A instead of Joker!");
            randIndex = this.ClosedDeck.findIndex(item => item.name == "1-1");
            this.jokerCard = (this.ClosedDeck[randIndex]);
        }
        this.currentGameRoundReport.gameData.joker = this.jokerCard.name;
        this.ClosedDeck.splice(randIndex, 1);
        //opening card
        let card = this.ClosedDeck[0];
        this.OpenDeck.push(card);
        this.ClosedDeck.splice(0, 1);
        //distribute cards
        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] != null && !this.PlayersUniqIdDict[i].isBlacklisted) {
                let plCardsMsg = {
                    t: "plCardsMsg",
                    cards: [],
                    joker: this.jokerCard.name,
                    openCard: this.OpenDeck[0].name
                };
                for (let j = 0; j < 13; j++) {
                    let randIndex = Math.floor(Math.random() * this.ClosedDeck.length);
                    this.PlayersUniqIdDict[i].addCardToDeck(this.ClosedDeck[randIndex]);
                    plCardsMsg.cards.push(this.ClosedDeck[randIndex].name);
                    this.ClosedDeck.splice(randIndex, 1);
                }
                setTimeout(() => { if (this.PlayersUniqIdDict[i])
                    this.PlayersUniqIdDict[i].sendMessage(plCardsMsg); }, 1000);
                this.PlayersUniqIdDict[i].infoLog(`Cards Distributed`, { cards: JSON.stringify(plCardsMsg.cards) });
                (0, LoggingHandler_1.LogMessage)(`Player ${i} cards are ${JSON.stringify(plCardsMsg.cards)}`, this);
            }
            else if (this.PlayersUniqIdDict[i] != null && this.PlayersUniqIdDict[i].isBlacklisted) {
                let plGameData = {
                    t: "plGameData",
                    joker: this.jokerCard.name,
                    openCard: this.OpenDeck[0].name
                };
                this.PlayersUniqIdDict[i].sendMessage(plGameData);
            }
        }
        setTimeout(() => {
            if (this.isGameEnded) {
                //This is added because if game ends due to All Opponent left before this timeout, then we don't want to start the game
                return;
            }
            (0, LoggingHandler_1.LogMessage)("Scheduling Turn Timeout", this);
            // this.gamePlayTimeout = setTimeout(this.gamePlayLoop.bind(this), 1000)
            // this.gameState = GAMESTATE.INGAME;
            this.gameStateHandler.SetState(Utils_1.GAMESTATE.INGAME);
            this.turnTimeout = setTimeout(this.turnTimerLoop.bind(this), 1000);
        }, 4000);
    }
    pickACard() {
    }
    handleCardPicked(pl, type, cardPickClickMsg) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.gameStateHandler.GetState != Utils_1.GAMESTATE.INGAME) {
                (0, LoggingHandler_1.LogMessage)("Game is not in ingame state", this);
                return;
            }
            if (this.currPlAtTurn != pl) {
                (0, LoggingHandler_1.LogMessage)(`Player ${pl.playerID} is not at turn`, this);
                return;
            }
            //check if player can pick the card
            if (pl.lastPickedCard != undefined) {
                (0, LoggingHandler_1.LogMessage)(`Player ${pl.playerID} has already picked a card`, this);
                return;
            }
            let cardPicked;
            this.sendMessageToOthers(cardPickClickMsg, pl.plRoomNetId);
            if (type == "close") {
                // pick card from closed deck
                //let randIndex = Math.floor(Math.random() * this.ClosedDeck.length)
                cardPicked = (this.ClosedDeck[0]);
                pl.addCardToDeck(cardPicked);
                this.ClosedDeck.splice(0, 1);
            }
            else if (type == "open") {
                //pick card from open deck
                cardPicked = (this.OpenDeck[this.OpenDeck.length - 1]);
                pl.addCardToDeck(cardPicked);
                this.OpenDeck.splice(this.OpenDeck.length - 1, 1);
            }
            pl.lastPickedCard = cardPicked;
            try {
                let cardPickResponse = {
                    t: "cardPickRespMsg",
                    plId: pl.plRoomNetId,
                    card: pl.lastPickedCard.name
                };
                pl.infoLog(`Card Picked`, { card: cardPickResponse.card, deck: type });
                this.canDiscardCard = true;
                (0, LoggingHandler_1.LogMessage)(`Player ${pl.plRoomNetId} picked card ${cardPicked.name} from ${type} deck`, this, pl);
                pl.sendMessage(cardPickResponse);
            }
            catch (er) {
                yield (0, apicalls_1.sendToAnalytics)({
                    collection: apicalls_1.DBCollectionNames.UnexpectedErrors,
                    data: {
                        type: "Error in handleCardPicked",
                        room: this.tableGameId,
                        msg: "Error in handle card picked",
                        gameRoundId: this.currentGameRoundId,
                        playerId: pl.playerID,
                        closedDeckLength: this.ClosedDeck.length,
                        openDeckLength: this.OpenDeck.length,
                        cardPickClickMsg: cardPickClickMsg,
                        time: new Date()
                    }
                });
                throw er;
            }
        });
    }
    handleCardDiscard(pl, discard, cardsFormation, finishGame) {
        if (this.gameStateHandler.GetState != Utils_1.GAMESTATE.INGAME) {
            (0, LoggingHandler_1.LogMessage)(`Player ${pl.playerID} tried to discard card when game is not in ingame state`, this);
            return;
        }
        if (this.currPlAtTurn != pl || !this.canDiscardCard) {
            console.log("Invalid Discard Request from Non Current Turn Player");
            return;
        }
        (0, LoggingHandler_1.LogMessage)(`Player ${pl.plRoomNetId} Discarded ${discard}`, this, pl);
        const discardCard = Card_1.Card.convertToCard(discard);
        if (!pl.checkIfCardExists(discardCard)) {
            // LogMessage("discard card" + discard)
            // console.log("invalid card sent for discarding");
            (0, LoggingHandler_1.LogMessage)(`Player ${pl.plRoomNetId} sent invalid card for discarding`, this, pl);
            return;
        }
        this.canDiscardCard = false;
        (0, timers_1.clearTimeout)(this.turnTimeout);
        pl.lastPickedCard = undefined;
        this.checkIfNeedToFlipCards();
        this.OpenDeck.push(discardCard);
        pl.removeCardFromDeck(discardCard);
        // if (pl.finalCardsFormation.length == 0)
        (0, LoggingHandler_1.LogMessage)(`Player ${pl.plRoomNetId} Discarded ${discard} with FinishGame=${finishGame}`, this, pl);
        (0, LoggingHandler_1.LogMessage)(`Player ${pl.plRoomNetId} Cards Formation ${cardsFormation}`, this, pl);
        pl.infoLog(`Discarded Card`, { card: discard, finishGame: finishGame, cardsFormation: JSON.stringify(cardsFormation) });
        pl.updateDeckFormation(cardsFormation);
        // pl.finalCardsFormation = cardsFormation;
        if (!finishGame) {
            console.log("Calling Next Turn from Discard :" + this.currentGameRoundId);
            if (this.gameStateHandler.GetState != Utils_1.GAMESTATE.INGAME) {
                (0, LoggingHandler_1.LogMessage)(`Game is not in ingame state finish game can't Start turn Timer`, this);
                return;
            }
            let nextPlayerTurnMsg = {
                t: "nextPlayerTurnMsg",
                plId: this.getNextPlayerForTurn(),
                openDeck: discardCard.name
            };
            this.sendMessageToAll(nextPlayerTurnMsg);
            this.turnTimer = this.turnTimeVal;
            this.extraTimer = this.extraTimeVal;
            this.turnTimeout = setTimeout(this.turnTimerLoop.bind(this), 1000);
        }
        else {
            if (this.declarePlId != -1)
                return;
            this.declarePlId = pl.plRoomNetId;
            this.gameStateHandler.SetState(Utils_1.GAMESTATE.FINISHING);
            // this.gameState = GAMESTATE.FINISHING;
            let gameFinishMsg = {
                t: "gameFinishMsg",
                plId: pl.plRoomNetId,
                timeLeft: pl.savedTime + 30
            };
            // this.sendMessageToOthers()
            this.sendMessageToAll(gameFinishMsg);
            // for (let i = 0; i < this.maxPlayers; i++) {
            //     if (this.PlayersUniqIdDict[i] != null && this.PlayersUniqIdDict[i] != undefined) {
            //         this.PlayersUniqIdDict[i].sendMessage(gameFinishMsg);
            //     }
            // }
            pl.finalTurnTimeout = setTimeout(() => {
                if (pl) {
                    if (pl.hasSubmitted) {
                        console.log("all is good");
                    }
                    else {
                        this.handleDeclare(pl, pl.cardFormationString);
                    }
                }
            }, (pl.savedTime + 32) * 1000);
            pl.finalTurnTimeoutKeeper = new Utils_1.TimeoutKeeper((pl.savedTime + 32) * 1000, pl.finalTurnTimeout);
        }
    }
    handleDroppedGame(pl, cardsFormation) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.currPlAtTurn.plRoomNetId != pl.plRoomNetId) {
                return;
            }
            (0, LoggingHandler_1.LogMessage)(`Player ${pl.plRoomNetId} Dropped Game`, this, pl);
            (0, timers_1.clearTimeout)(this.turnTimeout);
            pl.infoLog(`Dropped Game`, { cardsFormation: JSON.stringify(cardsFormation) });
            pl.playerState = Utils_1.PLAYERSTATE.DROPPED;
            pl.updateDeckFormation(cardsFormation);
            // pl.finalCardsFormation = cardsFormation;
            pl.lostPoints = (pl.noOfTurns < 2) ? 20 : 40;
            pl.result = "dropped";
            yield this.handleChargePlayer(pl, pl.lostPoints * this.pointsVal, "Player Dropped");
            // this.potDistribution += pl.lostPoints;
            let droppedPlayerMsg = { t: "plDropped", plId: pl.plRoomNetId, lostPoints: pl.lostPoints, amt: -Math.trunc(pl.lostPoints * this.pointsVal * 100) / 100, cards: pl.cardFormationString };
            this.sendMessageToAll(droppedPlayerMsg);
            // this.blacklist.push(pl.plRoomNetId);
            // this.removePlayerFromRoom(pl);
            //if alone player left then make last player winner
            if (this.activePlayersCount == 1) {
                this.endRummyGame({}, Utils_1.GAMEENDCONDITION.OPPONENTINVALIDDECLARE);
            }
            else {
                console.log("Calling Get Next Player for Turn from Dropped Game : " + this.currentGameRoundId);
                let nextPlayerTurnMsg = {
                    t: "nextPlayerTurnMsg",
                    plId: this.getNextPlayerForTurn(),
                    openDeck: this.OpenDeck[this.OpenDeck.length - 1].name
                };
                this.sendMessageToAll(nextPlayerTurnMsg);
                this.turnTimer = this.turnTimeVal;
                this.extraTimer = this.extraTimeVal;
                this.turnTimeout = setTimeout(this.turnTimerLoop.bind(this), 1000);
            }
        });
    }
    turnTimerLoop() {
        (0, LoggingHandler_1.LogMessage)(`Turn Timer Loop`, this, this.currPlAtTurn);
        if (this.currPlAtTurn && this.PlayersUniqIdDict[this.currPlAtTurn.plRoomNetId]) {
            if (this.turnTimer == 0 && this.currPlAtTurn.savedTime > 0) {
                (0, LoggingHandler_1.LogMessage)(`Player ${this.currPlAtTurn.playerID} decreasing saved time.`, this, this.currPlAtTurn);
                this.currPlAtTurn.savedTime--;
            }
            else if (this.turnTimer == 0 && this.currPlAtTurn.savedTime <= 0) {
                (0, LoggingHandler_1.LogMessage)(`Player ${this.currPlAtTurn.playerID} decreasing extra timer.`, this, this.currPlAtTurn);
                this.extraTimer--;
            }
            else {
                (0, LoggingHandler_1.LogMessage)(`Player ${this.currPlAtTurn.playerID} decreasing turn timer.`, this, this.currPlAtTurn);
                this.turnTimer--;
            }
        }
        else {
            (0, LoggingHandler_1.LogMessage)(`Player ${this.currPlAtTurn.playerID}  resetting turn timer & extra timer`, this, this.currPlAtTurn);
            this.turnTimer = 0;
            this.extraTimer = 0;
        }
        let timerMsg = {
            t: Utils_1.MSGTYPE.TIMER,
            data: this.turnTimer,
            extraTime: this.currPlAtTurn.savedTime,
            currPlTurn: this.currPlAtTurn.plRoomNetId
        };
        this.sendMessageToAll(timerMsg);
        if ((this.currPlAtTurn.playerState == Utils_1.PLAYERSTATE.LEFT || (this.turnTimer == 0 && this.currPlAtTurn.savedTime == 0)) && this.canDiscardCard) {
            (0, LoggingHandler_1.LogMessage)(`Player ${this.currPlAtTurn.playerID}  Discarding Card`, this, this.currPlAtTurn);
            if (this.currPlAtTurn.lastPickedCard != undefined) {
                (0, LoggingHandler_1.LogMessage)(`Player ${this.currPlAtTurn.playerID}  Discarding last picked card`, this, this.currPlAtTurn);
                this.canDiscardCard = false;
                this.currPlAtTurn.sendMessage({ t: "canDiscard", data: false });
            }
        }
        if (this.currPlAtTurn.playerState == Utils_1.PLAYERSTATE.LEFT || (this.turnTimer == 0 && this.currPlAtTurn.savedTime == 0 && this.extraTimer == 0)) {
            (0, LoggingHandler_1.LogMessage)(`Player ${this.currPlAtTurn.playerID}  skipping turn`, this, this.currPlAtTurn);
            let playerSkippingTurn = this.currPlAtTurn.plRoomNetId;
            if (this.currPlAtTurn != null && this.currPlAtTurn != undefined) {
                this.currPlAtTurn.skippedTurns++;
            }
            if (this.currPlAtTurn.lastPickedCard != undefined) {
                this.checkIfNeedToFlipCards();
                this.OpenDeck.push(this.currPlAtTurn.lastPickedCard);
                this.currPlAtTurn.removeCardFromDeck(this.currPlAtTurn.lastPickedCard, true);
                // this.currPlAtTurn.finalCardsFormation.push([this.currPlAtTurn.lastPickedCard.name]);
                const discardedCardInfo = {
                    t: "cardDiscarded",
                    plId: this.currPlAtTurn.plRoomNetId,
                    cardId: this.currPlAtTurn.lastPickedCard.name
                };
                this.currPlAtTurn.sendMessage(discardedCardInfo);
                (0, LoggingHandler_1.LogMessage)(this.currPlAtTurn.plRoomNetId + " - Auto Card Discarded : " + this.currPlAtTurn.lastPickedCard.name, this, this.currPlAtTurn);
            }
            console.log("Calling next player turn from turn timer loop : " + this.currentGameRoundReport);
            this.getNextPlayerForTurn();
            let turnSkipMsg = {
                t: Utils_1.MSGTYPE.TURNSKIPPED,
                plId: playerSkippingTurn,
                nextRoll: this.currPlAtTurn.plRoomNetId,
            };
            if (this.PlayersUniqIdDict[playerSkippingTurn]) {
                turnSkipMsg.lives = this.PlayersUniqIdDict[playerSkippingTurn].skippedTurns;
                if (this.PlayersUniqIdDict[playerSkippingTurn].lastPickedCard != undefined) {
                    turnSkipMsg.openCard = this.PlayersUniqIdDict[playerSkippingTurn].lastPickedCard.name;
                    this.PlayersUniqIdDict[playerSkippingTurn].lastPickedCard = undefined;
                }
            }
            else if (this.PermaLeftPlayerUniqIdDict[playerSkippingTurn]) {
                turnSkipMsg.lives = this.PermaLeftPlayerUniqIdDict[playerSkippingTurn].skippedTurns;
                if (this.PermaLeftPlayerUniqIdDict[playerSkippingTurn].lastPickedCard != undefined) {
                    turnSkipMsg.openCard = this.PermaLeftPlayerUniqIdDict[playerSkippingTurn].lastPickedCard.name;
                    this.PermaLeftPlayerUniqIdDict[playerSkippingTurn].lastPickedCard = undefined;
                }
            }
            else {
                (0, apicalls_1.sendToAnalytics)({
                    collection: apicalls_1.DBCollectionNames.UnexpectedErrors,
                    data: {
                        type: "PlayerNotFoundInSkipTurn",
                        msg: "Player not found in turn skip",
                        plId: playerSkippingTurn,
                        table: this.tableGameId,
                        gameRoundId: this.currentGameRoundId,
                        time: new Date()
                    }
                });
            }
            this.sendMessageToAll(turnSkipMsg);
            (0, timers_1.clearTimeout)(this.turnTimeout);
            this.turnTimer = this.turnTimeVal;
            this.extraTimer = this.extraTimeVal;
            this.turnTimeout = setTimeout(this.turnTimerLoop.bind(this), 1000);
            if (this.PlayersUniqIdDict[playerSkippingTurn] && this.PlayersUniqIdDict[playerSkippingTurn].skippedTurns >= 3) {
                const pl = this.PlayersUniqIdDict[playerSkippingTurn];
                const kickReq = {
                    removeEvent: Utils_1.RemovePlayerEvent.TIMEOUT,
                    callBack: undefined
                };
                pl.infoLog(`Three Skips Kicked`);
                const removeReq = new RemoveRequest_1.RemoveRequest(pl, DataTypes_1.LeaveState.KICKED, kickReq);
                this.removeRequestHandler.AddRequest(removeReq);
                // if(!pl.isDisconnected)
                //     this.sendMessageToAll({ t: MSGTYPE.PLEFT, data: playerSkippingTurn, state : pl.playerState});
                // this.threeSkipsKick(playerSkippingTurn, RemovePlayerEvent.TIMEOUT);
                // let plKillMsg = {
                //     t: MSGTYPE.THREESKIPS,
                //     plId: playerSkippingTurn,
                // }
                // pl.sendMessage(plKillMsg)
            }
        }
        else {
            (0, LoggingHandler_1.LogMessage)(`Player ${this.currPlAtTurn.playerID}  calling setTimeout for TurnTimerLoop`, this, this.currPlAtTurn);
            this.turnTimeout = setTimeout(this.turnTimerLoop.bind(this), 1000);
        }
    }
    checkIfNeedToFlipCards() {
        if (this.ClosedDeck.length == 0) {
            // const firstCardFromOpenDeck = this.OpenDeck.shift();
            // if(firstCardFromOpenDeck == undefined)
            // {
            //     throw new Error("Open Deck is empty");
            // }
            this.ClosedDeck = [];
            this.ClosedDeck = [...this.OpenDeck.reverse()];
            this.OpenDeck = [];
            this.sendMessageToAll({ t: "cardsFlipped" });
        }
    }
    // async threeSkipsKick(plId : number, removeEvent : RemovePlayerEvent)
    // {
    //     this.PlayersUniqIdDict[plId].playerState = PLAYERSTATE.LEFT;
    //     this.addToPermaLeft(this.PlayersUniqIdDict[plId]);
    //     delete this.PlayersUniqIdDict[plId];
    //     this.currentPlayersCount--;
    //     this.PermaLeftPlayerUniqIdDict[plId].lostPoints = 80;
    //     this.PermaLeftPlayerUniqIdDict[plId].result = "lost";
    //     await this.handleChargePlayer(this.PermaLeftPlayerUniqIdDict[plId], this.PermaLeftPlayerUniqIdDict[plId].lostPoints * this.pointsVal, "Three Skips Kicked");
    //     CallLeftPlayerAPI(this.tableGameId, this.PermaLeftPlayerUniqIdDict[plId].playerID, removeEvent);
    //     sendToAnalytics({
    //         collection : DBCollectionNames.GAME_EVENTS,
    //         data : {
    //             type : "ThreeSkipsKicked",
    //             playerId : this.PermaLeftPlayerUniqIdDict[plId].playerID,
    //             table : this.tableGameId,
    //             gameRoundId : this.currentGameRoundId,
    //             time : new Date()
    //         }
    //     });
    //     try {
    //         this.PermaLeftPlayerUniqIdDict[plId].plSocket?.close();
    //     } catch
    //     {
    //         LogMessage("Error in closing socket", this, this.PermaLeftPlayerUniqIdDict[plId]);
    //         sendToAnalytics({
    //             collection : DBCollectionNames.UnexpectedErrors,
    //             data : {
    //                 type : "ErrorInClosingSocket",
    //                 msg : "Error in closing socket while three skips kicked",
    //                 playerId : this.PermaLeftPlayerUniqIdDict[plId].playerID,
    //                 tableGameId : this.tableGameId,
    //                 gameRoundId : this.currentGameRoundId,
    //                 time : new Date()
    //             }});
    //     }
    //     LogMessage(`Checking after 3 skips kick`, this);
    //     await this.checkIfNeedToEndGame(); 
    // }
    get activePlayersCount() {
        let count = 0;
        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] && this.PlayersUniqIdDict[i].playerState == Utils_1.PLAYERSTATE.INGAME)
                count++;
        }
        return count;
    }
    waitTimerLoop() {
        this.waitTimer--;
        //   console.log("Running Wait Timer Loop ==== " + this.waitTimer)
        //   console.log("Running Wait Timer Loop ==== " + this.waitTimeout)
        let waitTimerMsg = {
            t: Utils_1.MSGTYPE.WAITTIMER,
            data: this.waitTimer,
        };
        this.sendMessageToAll(waitTimerMsg);
        if (this.waitTimer == 0) {
            console.log(this.activePlayersCount);
            (0, LoggingHandler_1.LogMessage)("Current Players  :" + this.currentPlayersCount, this);
            if (this.currentPlayersCount >= this.minPlayers) {
                (0, timers_1.clearTimeout)(this.waitTimeout);
                this.startTheGame();
            }
            else {
                this.waitTimer = this.waitTimerVal;
                this.waitTimeout = setTimeout(this.waitTimerLoop.bind(this), 1000);
            }
        }
        else {
            this.waitTimeout = setTimeout(this.waitTimerLoop.bind(this), 1000);
        }
    }
    getNextPlayerForTurn() {
        var _a;
        console.log("getting next player");
        let nextPlayer = null;
        let currPlId = this.currPlAtTurn != null ? this.currPlAtTurn.plRoomNetId : 0;
        let loopCount = 0;
        while (nextPlayer == null || nextPlayer == undefined) {
            console.log("while loop 1 " + this.currentGameRoundId);
            if (this.gameStateHandler.GetState != Utils_1.GAMESTATE.INGAME && this.gameStateHandler.GetState != Utils_1.GAMESTATE.TOSS) {
                (0, LoggingHandler_1.LogMessage)("Game is not in ingame state stopping While Loop 1", this);
                (0, LoggingHandler_1.LogMessage)('Current Player  : ' + ((_a = this.currPlAtTurn) === null || _a === void 0 ? void 0 : _a.playerID), this);
                return null;
            }
            if (loopCount > 10) {
                console.log(this.currPlAtTurn.playerID);
                console.log("---------------------");
                for (let i = 0; i < this.maxPlayers; i++) {
                    console.log(i);
                    if (this.PlayersUniqIdDict[i])
                        console.log(this.PlayersUniqIdDict[i].playerID + " : " + Utils_1.PLAYERSTATE[this.PlayersUniqIdDict[i].playerState]);
                }
                console.log("---------------------");
            }
            if (this.currentPlayersCount <= 1) {
                return null;
            }
            currPlId++;
            if (currPlId >= this.maxPlayers) {
                currPlId = 0;
            }
            if (this.PlayersUniqIdDict[currPlId] && !this.PlayersUniqIdDict[currPlId].isBlacklisted)
                nextPlayer = this.PlayersUniqIdDict[currPlId];
            loopCount++;
        }
        this.currPlAtTurn = nextPlayer;
        // console.log(this.currPlAtTurn.plRoomNetId + " : Next Player Selected!");
        (0, LoggingHandler_1.LogMessage)(this.currPlAtTurn.playerID + " : Next Player Selected!", this, this.currPlAtTurn);
        this.currPlAtTurn.noOfTurns++;
        return currPlId;
    }
    getWhoseWillBeNextTurn() {
        console.log("getting next player");
        let nextPlayer = null;
        let currPlId = this.currPlAtTurn != null ? this.currPlAtTurn.plRoomNetId : 0;
        while (nextPlayer == null || nextPlayer == undefined) {
            console.log("while loop 1");
            if (this.currentPlayersCount <= 1) {
                return null;
            }
            currPlId++;
            if (currPlId >= this.maxPlayers) {
                currPlId = 0;
            }
            if (this.PlayersUniqIdDict[currPlId] && !this.PlayersUniqIdDict[currPlId].isBlacklisted)
                nextPlayer = this.PlayersUniqIdDict[currPlId];
        }
        this.currPlAtTurn = nextPlayer;
        this.currPlAtTurn.noOfTurns++;
        return currPlId;
    }
    handleDeclare(pl, cards) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.gameStateHandler.GetState != Utils_1.GAMESTATE.FINISHING) {
                (0, LoggingHandler_1.LogMessage)(`Player : ${pl.playerID} tried to declare but game is not in ingame state`, this, pl);
                console.log("Can't Decalre, Game is not in ingame state for " + pl.plRoomNetId);
                return;
            }
            if (pl.finalTurnTimeout)
                (0, timers_1.clearTimeout)(pl.finalTurnTimeout);
            else {
                (0, LoggingHandler_1.LogMessage)(`Player : ${pl.playerID} tried to declare but final turn timeout didn't started`, this, pl);
                console.log("Can't Decalre, Final Turn Timeout didn't started for " + pl.plRoomNetId);
                return;
            }
            pl.finalTurnTimeout = null;
            (0, LoggingHandler_1.LogMessage)("Player " + pl.plRoomNetId + " Declared with cards " + JSON.stringify(cards), this, pl);
            pl.infoLog(`Declare Cards`, { cards: JSON.stringify(cards) });
            pl.updateDeckFormation(cards);
            // pl.finalCardsFormation = cards;
            let isValidDeclare = true;
            let Sets = [];
            let PureSeqs = [];
            let ImpureSeqs = [];
            (0, LoggingHandler_1.LogMessage)("Cards : " + JSON.stringify(cards), this, pl);
            console.log("Cards : " + JSON.stringify(cards));
            for (let i = 0; i < cards.length; i++) {
                let setseq = cards[i];
                //Check if there is atleast one pure sequence
                //check if there is one more sequence
                let isSet = (0, Utils_1.isValidSet)(setseq, this.jokerCard.val);
                let ispureSeq = (0, Utils_1.isValidPureSequence)(setseq);
                let isImpureSeq = (0, Utils_1.isValidImpureSequence)(setseq, this.jokerCard.val);
                if (ispureSeq)
                    PureSeqs.push(setseq);
                else if (isImpureSeq)
                    ImpureSeqs.push(setseq);
                else if (isSet)
                    Sets.push(setseq);
                else {
                    isValidDeclare = false;
                    break;
                }
            }
            let totalUsedCards = Sets.map(x => x.length).reduce((a, b) => a + b, 0) + PureSeqs.map(x => x.length).reduce((a, b) => a + b, 0) + ImpureSeqs.map(x => x.length).reduce((a, b) => a + b, 0);
            console.log(totalUsedCards);
            const count = cards.map(x => x.length).reduce((a, b) => a + b, 0);
            console.log(count);
            if (totalUsedCards == count) {
                if (PureSeqs.length >= 1 && PureSeqs.length + ImpureSeqs.length > 1) {
                    isValidDeclare = true;
                }
                else {
                    isValidDeclare = false;
                }
            }
            //to change
            // isValidDeclare = true;
            if (!isValidDeclare) {
                pl.lostPoints = 80;
                pl.result = "lost";
                pl.infoLog(`Invalid Declare`, { cards: JSON.stringify(cards) });
                this.declarePlId = -1;
                if (pl.playerState == Utils_1.PLAYERSTATE.LEFT)
                    pl.result = "Invalid Declare";
                else
                    pl.playerState = Utils_1.PLAYERSTATE.DROPPED;
                console.log("Player state On Invalid Declare  :" + pl.playerState + "      " + this.gameStateHandler.GetState);
                yield this.handleChargePlayer(pl, pl.lostPoints * this.pointsVal, "invalid declare");
                // this.potDistribution += pl.lostPoints;
                let invDeclMsg = { t: "invalidDeclare", plid: pl.plRoomNetId, lostPoints: pl.lostPoints, amt: -Math.trunc(pl.lostPoints * this.pointsVal * 100) / 100, cards: pl.cardFormationString };
                this.sendMessageToAll(invDeclMsg);
                // this.removePlayerFromRoom(pl);
                //if alone player left then make last player winner
                if (this.activePlayersCount == 1) {
                    this.endRummyGame({}, Utils_1.GAMEENDCONDITION.OPPONENTINVALIDDECLARE);
                }
                else if (this.activePlayersCount > 1) {
                    this.gameStateHandler.SetState(Utils_1.GAMESTATE.INGAME);
                    console.log("Calling Next Turn from Invalid Declare : " + this.currentGameRoundId);
                    let nextPlayerTurnMsg = {
                        t: "nextPlayerTurnMsg",
                        plId: this.getNextPlayerForTurn(),
                        openDeck: this.OpenDeck[this.OpenDeck.length - 1].name
                    };
                    // this.gameState = GAMESTATE.INGAME;
                    this.sendMessageToAll(nextPlayerTurnMsg);
                    this.turnTimer = this.turnTimeVal;
                    this.extraTimer = this.extraTimeVal;
                    this.turnTimeout = setTimeout(this.turnTimerLoop.bind(this), 1000);
                }
                else {
                    (0, apicalls_1.sendToAnalytics)({
                        collection: apicalls_1.DBCollectionNames.UnexpectedErrors,
                        data: {
                            type: "ActivePlayersCountLessThanZero",
                            tableId: this.tableGameId,
                            gameRoundId: this.currentGameRoundId,
                            activePlayersCount: this.activePlayersCount,
                            currentCount: this.currentPlayersCount,
                            discardPlId: pl.playerID,
                            time: new Date()
                        }
                    });
                }
            }
            else {
                pl.lostPoints = 0;
                pl.result = "win";
                this.winner = pl.plRoomNetId;
                let DeclMsg = { t: "validDeclare", plid: pl.plRoomNetId, amt: Math.trunc(pl.lostPoints * this.pointsVal * 100) / 100, cards: pl.cardFormationString };
                // this.gameState = GAMESTATE.SUBMITING;
                pl.infoLog(`Valid Declare`, { cards: JSON.stringify(cards) });
                this.gameStateHandler.SetState(Utils_1.GAMESTATE.SUBMITING);
                for (let i = 0; i < this.maxPlayers; i++) {
                    if (this.PlayersUniqIdDict[i] != null && this.PlayersUniqIdDict[i] != undefined) {
                        if (this.PlayersUniqIdDict[i] != pl && !this.PlayersUniqIdDict[i].isBlacklisted) {
                            DeclMsg.timer = this.PlayersUniqIdDict[i].savedTime + 30;
                            this.PlayersUniqIdDict[i].finalTurnTimeout = setTimeout(() => {
                                if (this.PlayersUniqIdDict[i].hasSubmitted) {
                                    console.log("all is good");
                                }
                                else {
                                    (0, LoggingHandler_1.LogMessage)("Player " + this.PlayersUniqIdDict[i].plRoomNetId + " didn't submit in time", this, this.PlayersUniqIdDict[i]);
                                    this.handleSubmit(this.PlayersUniqIdDict[i], this.PlayersUniqIdDict[i].cardFormationString);
                                }
                            }, (this.PlayersUniqIdDict[i].savedTime + 32) * 1000);
                            this.PlayersUniqIdDict[i].finalTurnTimeoutKeeper = new Utils_1.TimeoutKeeper((this.PlayersUniqIdDict[i].savedTime + 32) * 1000, this.PlayersUniqIdDict[i].finalTurnTimeout);
                        }
                        if (this.PlayersUniqIdDict[i])
                            this.PlayersUniqIdDict[i].sendMessage(DeclMsg);
                        else
                            console.log("Player already left");
                    }
                }
                // this.sendMessageToAll(DeclMsg)
            }
            pl.hasSubmitted = true;
        });
    }
    handleSubmit(pl, cards) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.gameStateHandler.GetState != Utils_1.GAMESTATE.SUBMITING) {
                (0, LoggingHandler_1.LogMessage)(`Player ${pl.playerID} submitted in wrong state`, this, pl);
                return;
            }
            if (pl.finalTurnTimeout)
                (0, timers_1.clearTimeout)(pl.finalTurnTimeout);
            else {
                console.log("Can't Submit, Final Turn Timeout didn't started for " + pl.plRoomNetId);
                return;
            }
            (0, LoggingHandler_1.LogMessage)(`Player ${pl.plRoomNetId} submitted cards ${JSON.stringify(cards)}`, this, pl);
            pl.infoLog(`Submitted Cards`, { cards: JSON.stringify(cards) });
            pl.finalTurnTimeout = null;
            console.log("Submit Cards");
            console.log(cards);
            let lostPoints = 0;
            let Sets = [];
            let PureSeqs = [];
            let ImpureSeqs = [];
            //checking for pure seqs
            for (let i = 0; i < cards.length; i++) {
                let setseq = cards[i];
                let ispureSeq = (0, Utils_1.isValidPureSequence)(setseq);
                let isImpureSeq = (0, Utils_1.isValidImpureSequence)(setseq, this.jokerCard.val);
                if (ispureSeq)
                    PureSeqs.push(setseq);
                else if (isImpureSeq) {
                    ImpureSeqs.push(setseq);
                }
            }
            for (let i = 0; i < cards.length; i++) {
                let setseq = cards[i];
                //Check if there is atleast one pure sequence
                //check if there is one more sequence
                let isSet = (0, Utils_1.isValidSet)(setseq, this.jokerCard.val);
                let ispureSeq = (0, Utils_1.isValidPureSequence)(setseq);
                let isImpureSeq = (0, Utils_1.isValidImpureSequence)(setseq, this.jokerCard.val);
                let hasToAdd = false;
                if (ispureSeq) {
                }
                else if (isImpureSeq) {
                    if (PureSeqs.length == 0 || PureSeqs.length + ImpureSeqs.length <= 1)
                        hasToAdd = true;
                }
                else if (isSet) {
                    Sets.push(setseq);
                    if (PureSeqs.length == 0 || PureSeqs.length + ImpureSeqs.length <= 1)
                        hasToAdd = true;
                }
                else {
                    // console.log(setseq)
                    hasToAdd = true;
                }
                if (hasToAdd) {
                    for (let j = 0; j < setseq.length; j++) {
                        if (setseq[j].split('-')[0] != this.jokerCard.name.split('-')[0]) {
                            let cardVal = parseInt(setseq[j].split('-')[0]);
                            let cardType = parseInt(setseq[j].split('-')[1]);
                            if (cardVal == 1 || cardVal == 11 || cardVal == 12 || cardVal == 13)
                                lostPoints += 10;
                            else
                                lostPoints += cardVal;
                            if (isNaN(lostPoints))
                                (0, apicalls_1.sendToAnalytics)({
                                    collection: apicalls_1.DBCollectionNames.UnexpectedErrors,
                                    data: {
                                        type: "InvalidLostPoints",
                                        msg: "Invalid Lost Points because of cardVal",
                                        setSeq: setseq,
                                        cardVal: cardVal,
                                        playerId: pl.playerID,
                                        tableGameId: this.tableGameId,
                                        session: this.currentGameRoundId,
                                        time: new Date()
                                    }
                                });
                        }
                    }
                }
            }
            lostPoints = lostPoints > 80 ? 80 : lostPoints;
            pl.updateDeckFormation(cards);
            // pl.cardFormationString = cards;
            pl.hasSubmitted = true;
            pl.lostPoints = lostPoints;
            pl.result = "lost";
            this.sendMessageToAll({ t: "lostpoints", plId: pl.plRoomNetId, lostpoints: pl.lostPoints, amt: -Math.trunc(pl.lostPoints * this.pointsVal * 100) / 100, cards: pl.cardFormationString });
            if (!pl.isCharged) {
                yield this.handleChargePlayer(pl, pl.lostPoints * this.pointsVal, "Lost points");
                pl.readyForResultCalculation = true;
            }
            (0, LoggingHandler_1.LogMessage)(`Player ${pl.playerID} lost ${pl.lostPoints} points`, this, pl);
            (0, LoggingHandler_1.LogMessage)(`isBlaclisted : ${pl.isBlacklisted} && isDisconnected : ${pl.isDisconnected}`, this, pl);
            this.checkIsResultReady(pl.playerID);
        });
    }
    checkIsResultReady(playerId) {
        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] !== null
                && this.PlayersUniqIdDict[i] != undefined
                && !this.PlayersUniqIdDict[i].isBlacklisted
            // && (!this.PlayersUniqIdDict[i].isDisconnected // Removing isDisconnected check as player can be disconnected and server will submit cards for him 
            // || (this.PlayersUniqIdDict[i].isDisconnected && this.PlayersUniqIdDict[i].finalTurnTimeout != null && this.PlayersUniqIdDict[i].finalTurnTimeout != undefined)) 
            ) {
                if (!this.PlayersUniqIdDict[i].hasSubmitted)
                    return;
                else {
                    if (this.PlayersUniqIdDict[i].result == "lost" && !this.PlayersUniqIdDict[i].readyForResultCalculation)
                        return;
                }
            }
        }
        (0, LoggingHandler_1.LogMessage)(`All players submitted their cards ${playerId}`, this);
        this.handleResult("valid declare");
        //TODO ADD AWAIT HERE.
    }
    handleResult(reason) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, LoggingHandler_1.LogMessage)(`Game ${this.currentGameRoundId} result is calculating, reason=${reason}`, this);
            this.currentGameRoundReport.reason = reason;
            // this.gameState = GAMESTATE.RESULT;
            this.gameStateHandler.SetState(Utils_1.GAMESTATE.RESULT);
            let result = [];
            let resultData = {};
            (0, logUtils_1.LogGameStateToDB)(logUtils_1.LogGameStates.RESULT_CALCULATED, this);
            // this.isGameEnded = true;
            //Charging disconnected players if they are not charged
            for (let i = 0; i < this.maxPlayers; i++) {
                if (this.PlayersUniqIdDict[i] && this.PlayersUniqIdDict[i].isDisconnected && !this.PlayersUniqIdDict[i].isBlacklisted) {
                    let pl = this.PlayersUniqIdDict[i];
                    if (!pl.isCharged && pl.result != "win") {
                        pl.lostPoints = 80;
                        // deduct balance from player
                        yield this.handleChargePlayer(pl, pl.lostPoints * this.pointsVal, "Lost points");
                    }
                }
            }
            for (let i = 0; i < this.maxPlayers; i++) {
                if (this.PlayersUniqIdDict[i] !== null && this.PlayersUniqIdDict[i] != undefined && this.PlayersUniqIdDict[i].playerState != Utils_1.PLAYERSTATE.WAITING) {
                    const playerId = this.PlayersUniqIdDict[i].playerID;
                    const resultLine = {
                        name: this.PlayersUniqIdDict[i].plName,
                        plId: this.PlayersUniqIdDict[i].plRoomNetId,
                        result: this.PlayersUniqIdDict[i].result,
                        points: this.PlayersUniqIdDict[i].lostPoints,
                        amount: -Math.trunc(this.PlayersUniqIdDict[i].lostPoints * this.pointsVal * 100) / 100,
                        cards: this.PlayersUniqIdDict[i].cardFormationString
                    };
                    let rake;
                    if (this.PlayersUniqIdDict[i].result == "win") {
                        rake = yield this.handleRewardPlayer(this.PlayersUniqIdDict[i], this.potDistribution, reason);
                        try {
                            //Removed RoundUp as for now trunc and round is same
                            resultLine.amount = Math.trunc((this.PlayersUniqIdDict[i].reward * 100)) / 100;
                            // resultLine.amount = this.PlayersUniqIdDict[i].reward;//Math.trunc(this.PlayersUniqIdDict[i].reward * 100) / 100;
                        }
                        catch (e) {
                            (0, apicalls_1.sendToAnalytics)({
                                collection: apicalls_1.DBCollectionNames.UnexpectedErrors,
                                data: {
                                    error: e,
                                    room: this.tableGameId,
                                    plName: resultLine.plName,
                                    plId: resultLine.plId,
                                    result: resultLine.result,
                                    playerId: playerId,
                                    gameRoundId: this.currentGameRoundId,
                                    time: new Date()
                                }
                            });
                            throw e;
                        }
                    }
                    resultData[this.PlayersUniqIdDict[i].playerID] = {
                        amount: resultLine.amount,
                        lostPoints: this.PlayersUniqIdDict[i].lostPoints,
                        cards: this.PlayersUniqIdDict[i].cardFormationString,
                        rake: rake != undefined && rake != null ? rake : 0
                    };
                    result.push(resultLine);
                }
            }
            for (let i = 0; i < this.maxPlayers; i++) {
                if (this.PermaLeftPlayerUniqIdDict[i] !== null && this.PermaLeftPlayerUniqIdDict[i] != undefined && this.PermaLeftPlayerUniqIdDict[i].playerState != Utils_1.PLAYERSTATE.WAITING) {
                    const resultLine = {
                        name: this.PermaLeftPlayerUniqIdDict[i].plName,
                        plId: this.PermaLeftPlayerUniqIdDict[i].plRoomNetId,
                        result: this.PermaLeftPlayerUniqIdDict[i].result,
                        points: this.PermaLeftPlayerUniqIdDict[i].lostPoints,
                        amount: -Math.trunc(this.PermaLeftPlayerUniqIdDict[i].lostPoints * this.pointsVal * 100) / 100,
                        cards: this.PermaLeftPlayerUniqIdDict[i].cardFormationString
                    };
                    let rake;
                    if (this.PermaLeftPlayerUniqIdDict[i].result == "win") {
                        rake = yield this.handleRewardPlayer(this.PermaLeftPlayerUniqIdDict[i], this.potDistribution, "valid declare");
                        //Removed RoundUp as for now trunc and round is same
                        resultLine.amount = Math.trunc((this.PermaLeftPlayerUniqIdDict[i].reward * 100)) / 100;
                        // callPlayerLeftTableAPI(GamesappGameId, this.PermaLeftPlayerUniqIdDict[i].playerID, this.PermaLeftPlayerUniqIdDict[i].tableGameID);
                    }
                    resultData[this.PermaLeftPlayerUniqIdDict[i].playerID] = {
                        amount: resultLine.amount,
                        lostPoints: this.PermaLeftPlayerUniqIdDict[i].lostPoints,
                        cards: this.PermaLeftPlayerUniqIdDict[i].cardFormationString,
                        rake: rake != undefined && rake != null ? rake : 0
                    };
                    result.push(resultLine);
                }
            }
            this.sendMessageToAll({ t: "resultMsg", result: result });
            // let resultData : Result = {};
            // for(let i = 0; i < result.length; i++)
            // {
            //     const r = result[i];
            //     resultData[r.plId] = {
            //         amount : r.amount,
            //         lostPoints : r.points,
            //         cards : r.cards,
            //     };
            // }
            this.currentGameRoundReport.result = resultData;
            this.currentGameRoundReport.endTime = new Date();
            // this.isGameEnded = true;
            //Removing Disconnect players from the game
            (0, LoggingHandler_1.LogMessage)("Removing Disconnect players from the game", this);
            this.kickInactivePlayers();
            let keys = Object.keys(this.PermaLeftPlayerUniqIdDict);
            //Remove Winner from Permanent Left Players from the game
            (0, LoggingHandler_1.LogMessage)("Perma Left Players : " + keys.length, this);
            for (let i = 0; i < keys.length; i++) {
                (0, LoggingHandler_1.LogMessage)("Looping Kicking Perma Player  : " + keys[i], this);
                const player = this.PermaLeftPlayerUniqIdDict[keys[i]];
                if (player && player.result == "win") {
                    (0, LoggingHandler_1.LogMessage)("Kicking Perma Player : " + keys[i], this);
                    const kickReq = {
                        removeEvent: Utils_1.RemovePlayerEvent.KICKED,
                        callBack: undefined
                    };
                    const removeReq = new RemoveRequest_1.RemoveRequest(player, DataTypes_1.LeaveState.KICKED, kickReq);
                    this.removeRequestHandler.AddRequest(removeReq);
                }
            }
            for (let i = 0; i < this.maxPlayers; i++) {
                if (this.PlayersUniqIdDict[i] && this.PlayersUniqIdDict[i].playerState == Utils_1.PLAYERSTATE.WAITING) {
                    this.currentGameRoundReport.waitingPlayers.push(this.PlayersUniqIdDict[i].playerID);
                }
            }
            (0, logUtils_1.LogGameStateToDB)(logUtils_1.LogGameStates.GAME_END, this);
            CallGameRoundReportAPI(this.tableGameId, this.currentGameRoundId, undefined, false, this.currentGameRoundReport);
            this.calculatedResult = result;
            if (this.currentPlayersCount <= 0) {
                //This means that restart call is not going to be called from MasterServer
                this.deleteTableTimeout = setTimeout(() => {
                    (0, LoggingHandler_1.LogMessage)("Deleting Table", this);
                    this.closeTableImmediate("Current Player Count is : " + this.currentPlayersCount, false);
                }, 5000);
            }
        });
    }
    kickInactivePlayers() {
        (0, LoggingHandler_1.LogMessage)("Removing Disconnect players from the game", this);
        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i]) {
                if (this.PlayersUniqIdDict[i].isDisconnected) {
                    const kickReq = {
                        removeEvent: Utils_1.RemovePlayerEvent.KICKED,
                        callBack: undefined
                    };
                    (0, LoggingHandler_1.LogMessage)("Removing Disconnect player : " + this.PlayersUniqIdDict[i].playerID, this);
                    const removeReq = new RemoveRequest_1.RemoveRequest(this.PlayersUniqIdDict[i], DataTypes_1.LeaveState.KICKED, kickReq);
                    this.removeRequestHandler.AddRequest(removeReq);
                }
                // this.kickInactivePlayer(this.PlayersUniqIdDict[i]);
            }
        }
        (0, LoggingHandler_1.LogMessage)("Current Players : " + this.currentPlayersCount, this);
    }
    // kickInactivePlayer(pl : Player)
    // {
    //     LogMessage(`Kicking player ${pl.playerID} from table ${this.tableGameId}`, this, pl);
    //     CallLeftPlayerAPI(this.tableGameId, pl.playerID, RemovePlayerEvent.KICKED);
    //     delete this.PlayersUniqIdDict[pl.plRoomNetId];
    //     this.currentPlayersCount--;
    // }
    kickIneligiblePlayersAndRestart(playerStatus) {
        const keys = Object.keys(playerStatus);
        (0, LoggingHandler_1.LogMessage)("Kicking Ineligible Players " + keys.length, this);
        for (let i = 0; i < this.maxPlayers; i++) {
            if (!this.PlayersUniqIdDict[i])
                continue;
            const player = this.PlayersUniqIdDict[i];
            if (!playerStatus[player.playerID]) {
                const errorReq = {
                    msg: "Insufficient Balance",
                    code: Utils_1.ErrorCode.INSUFFICIENT_BALANCE
                };
                (0, LoggingHandler_1.LogMessage)("Kicking Ineligible Player " + player.playerID, this);
                const removeReq = new RemoveRequest_1.RemoveRequest(player, DataTypes_1.LeaveState.ERROR, errorReq);
                this.removeRequestHandler.AddRequest(removeReq);
            }
        }
        // for(let i = 0; i < keys.length; i++)
        // {
        //     if(!playerStatus[keys[i]])
        //     {
        //         const plId = this.getSeatIdFromPlayerId(keys[i]);
        //         if(plId != "-1")
        //         {
        //             const pl = this.PlayersUniqIdDict[plId];
        //             if(pl == undefined || pl == null)
        //                 continue;
        //             const errorReq : ErrorRequest = {
        //                 msg : "Insufficient Balance",
        //                 code : ErrorCode.INSUFFICIENT_BALANCE
        //             };
        //             const removeReq = new RemoveRequest(pl, LeaveState.ERROR, errorReq);
        //             this.removeRequestHandler.AddRequest(removeReq);
        //             // if(pl)
        //             // {
        //             //     this.sendErrorToPlayer(pl,
        //             //         ErrorMessage.InsufficientBalance, undefined, {
        //             //         reason : RemovePlayerEvent.ERRORED
        //             //     });
        //             // }
        //         }
        //     }
        // }
        this.kickInactivePlayers();
        // //Kicking disconnected players from the table
        // for (let i = 0; i < this.maxPlayers; i++)
        // {
        //     if (this.PlayersUniqIdDict[i])
        //     {
        //         if(this.PlayersUniqIdDict[i].isDisconnected)
        //         {
        //             const kickReq : KickRequest = {
        //                 removeEvent : RemovePlayerEvent.KICKED,
        //                 callBack : undefined
        //             };
        //             const removeReq = new RemoveRequest(this.PlayersUniqIdDict[i], LeaveState.KICKED, kickReq);
        //             this.removeRequestHandler.AddRequest(removeReq);
        //         }
        //             // this.kickInactivePlayer(this.PlayersUniqIdDict[i]);
        //     }
        // }
        if (this.currentPlayersCount <= 0) {
            this.deleteTableTimeout = setTimeout(() => {
                console.log("closing the table");
                this.closeTableImmediate("Current Player Count is : " + this.currentPlayersCount, false);
            }, 5000);
        }
        else {
            // this.gameState = GAMESTATE.RESTARTING;
            this.gameStateHandler.SetState(Utils_1.GAMESTATE.RESTARTING);
            if (this.stopRestart) {
                console.log("Table Game restarting stop : " + this.tableGameId);
                (0, LoggingHandler_1.LogMessage)("Table Game restarting stop : " + this.tableGameId, this);
            }
            else {
                (0, LoggingHandler_1.LogMessage)("Restarting Table Game : " + this.tableGameId, this);
                this.isWaitingForRestart = true;
                this.restartTimeout = setTimeout(() => {
                    this.restartGame();
                }, 5000);
            }
        }
    }
    getSeatIdFromPlayerId(playerId) {
        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] && this.PlayersUniqIdDict[i].playerID == playerId) {
                return i.toString();
            }
        }
        return (-1).toString();
    }
    handleCardsCheck(pl, cards) {
        let isSet = (0, Utils_1.isValidSet)(cards, this.jokerCard.val);
        let ispureSeq = (0, Utils_1.isValidPureSequence)(cards);
        let isImpureSeq = (0, Utils_1.isValidImpureSequence)(cards, this.jokerCard.val);
        let checkMsg = {
            t: "cardSeqCheckMsg",
            isSet: isSet,
            isPureSeq: ispureSeq,
            isImpureSeq: isImpureSeq,
            cards: cards
        };
        pl.sendMessage(checkMsg);
    }
    sortCards(cards) {
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
    // async callAutoRefill(plRoomId: number) {
    //     let result = await callAutoRefillAPI(this.PlayersUniqIdDict[plRoomId].playerID, this.tableGameId)
    //     console.log(result)
    //     this.PlayersUniqIdDict[plRoomId].balance = result.coinBalance
    //     this.sendMessageToAll({ t: "pBal", id: plRoomId, bal: result.coinBalance })
    // }
    createShuffledCardDeck() {
        //creating cards
        for (let i = 1; i <= 13; i++) {
            this.ClosedDeck.push(new Card_1.Card(i, Card_1.SUIT.S));
        }
        for (let i = 1; i <= 13; i++) {
            this.ClosedDeck.push(new Card_1.Card(i, Card_1.SUIT.C));
        }
        for (let i = 1; i <= 13; i++) {
            this.ClosedDeck.push(new Card_1.Card(i, Card_1.SUIT.D));
        }
        for (let i = 1; i <= 13; i++) {
            this.ClosedDeck.push(new Card_1.Card(i, Card_1.SUIT.H));
        }
        for (let i = 1; i <= 13; i++) {
            this.ClosedDeck.push(new Card_1.Card(i, Card_1.SUIT.S));
        }
        for (let i = 1; i <= 13; i++) {
            this.ClosedDeck.push(new Card_1.Card(i, Card_1.SUIT.C));
        }
        for (let i = 1; i <= 13; i++) {
            this.ClosedDeck.push(new Card_1.Card(i, Card_1.SUIT.D));
        }
        for (let i = 1; i <= 13; i++) {
            this.ClosedDeck.push(new Card_1.Card(i, Card_1.SUIT.H));
        }
        this.ClosedDeck.push(new Card_1.Card(0, Card_1.SUIT.JOKER));
        this.ClosedDeck.push(new Card_1.Card(0, Card_1.SUIT.JOKER));
        //Shuffle Deck
        this.shuffle(this.ClosedDeck);
        //console.log(this.ClosedDeck)
    }
    restartGame() {
        if (this.turnTimeout) {
            (0, LoggingHandler_1.LogMessage)("Clearing Turn Timeout", this);
            (0, timers_1.clearTimeout)(this.turnTimeout);
        }
        this.currentGameRoundId = '';
        this.playersIdOnHold = [];
        // this.gamePlayTimer = this.gameTimerVal;
        this.gameStarted = false;
        this.isGameEnded = true;
        this.handleTossTimeout = undefined;
        this.calculatedResult = undefined;
        //  this.gameShouldEndNow = false;
        this.ClosedDeck = [];
        this.OpenDeck = [];
        // @ts-ignore: Unreachable code error
        this.jokerCard = null;
        this.potDistribution = 0;
        this.restartTimeout = undefined;
        this.winner = -1;
        this.isWaitingForRestart = false;
        this.declarePlId = -1; // reseting declarePlid for next game
        // this.gameState = GAMESTATE.MATCHMAKING;
        this.gameStateHandler.SetState(Utils_1.GAMESTATE.MATCHMAKING);
        this.createShuffledCardDeck();
        this.waitTimer = this.waitTimerVal;
        this.turnTimer = this.turnTimeVal;
        this.waitTimeout = setTimeout(this.waitTimerLoop.bind(this), 1000);
        this.PermaLeftPlayerUniqIdDict = {};
        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] && this.PlayersUniqIdDict[i] != undefined) {
                this.PlayersUniqIdDict[i].score = 0;
                this.PlayersUniqIdDict[i].skippedTurns = 0;
                this.PlayersUniqIdDict[i].savedTime = 90;
                this.PlayersUniqIdDict[i].lostPoints = 0;
                this.PlayersUniqIdDict[i].hasSubmitted = false;
                this.PlayersUniqIdDict[i].restartReset();
                // this.PlayersUniqIdDict[i].finalCardsFormation = [];
                this.PlayersUniqIdDict[i].isCharged = false;
                this.PlayersUniqIdDict[i].playerState = Utils_1.PLAYERSTATE.INGAME;
                this.PlayersUniqIdDict[i].result = undefined;
                this.PlayersUniqIdDict[i].reward = 0;
                this.PlayersUniqIdDict[i].lastPickedCard = undefined;
                this.PlayersUniqIdDict[i].readyForResultCalculation = false;
                this.PlayersUniqIdDict[i].noOfTurns = 0;
                if (this.PlayersUniqIdDict[i].finalTurnTimeout) {
                    // @ts-ignore: Unreachable code error
                    (0, timers_1.clearTimeout)(this.PlayersUniqIdDict[i].finalTurnTimeout);
                    this.PlayersUniqIdDict[i].finalTurnTimeout = null;
                }
            }
        }
        console.log("GAME RESTARTED!");
        // if (this.currentPlayersCount == this.maxPlayers) {
        //     this.startTheGame();
        // }
        // else if (this.currentPlayersCount >= this.minPlayers) {
        //     //start waiting and start countdown again
        //     this.startTheGame();
        // } else {
        //     //start waiting till players join
        // }
        if (this.currentPlayersCount <= 0) {
            this.deleteTableTimeout = setTimeout(() => {
                // console.log("closing the table")
                (0, LoggingHandler_1.LogMessage)("Closing the table", this);
                this.closeTableImmediate(`Current Player Count is ${this.currentPlayersCount}`, false);
            }, 5000);
        }
    }
}
exports.TableGameRoom = TableGameRoom;
//# sourceMappingURL=TableGameRoom.js.map