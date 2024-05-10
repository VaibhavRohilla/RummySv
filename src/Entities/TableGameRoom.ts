import { triggerAsyncId } from "async_hooks";
import { clear, log, timeStamp } from "console";
import e = require("express");
import { createReadStream, read } from "fs";
import { platform } from "os";
import { clearTimeout } from "timers";
import { convertToObject, createImportSpecifier, idText, updateFor } from "typescript";
import { CallDebitWalletAPI, CallLockFundsAPI, CallUpdatePlayerStatus, DBCollectionNames, sendToAnalytics } from "../apicalls";
import { ErrorRequest, KickRequest, LeaveState } from "../DataTypes";
import { Table, TableTypesDict } from "../server";
import { Card, SUIT } from "./Card";
import { GameStateHandler } from "./GameStates/GameState";
import { LogInit, LogMessage, TableLogInit } from "./LoggingHandler";
import { FunctionLogNames, LogBalanceDeductFail, LogErrorToDB, LogGameStates, LogGameStateToDB } from "./logUtils";
import { Player } from "./Player";
import { RemoveRequest, RemoveRequestQueue } from "./RemoveRequest";
import { ConvertTextToBase64, ErrorCode, ErrorMessage, GAMEENDCONDITION, GameEndReport, GAMESTATE, isValidImpureSequence, isValidPureSequence, isValidSet, JOINEDCASE, LEAVECASE, MSGTYPE, PLAYERSTATE, RemovePlayerEvent, Result, TimeoutKeeper, TxReasons } from "./Utils";
import { Money } from "./Money";
import { GlobalPlayerState } from "./DataTypes";

export class TableGameRoom {




    turnTimeVal = 30;
    public turnTimer = this.turnTimeVal;

    extraTimeVal: number = 2;
    extraTimer: number = this.extraTimeVal;

    waitTimerVal = 10
    public waitTimer = this.waitTimerVal;


    public minPlayers: number = 2;
    public maxPlayers: number = 6;
    public currPlAtTurn!: Player;

    public PlayersUniqIdDict: { [id: string]: Player; } = {};


    //these are players who are disconnected from game -- these will be able to come back. 
    //internet disconnected
    // public TempLeftPlayerUniqIdDict: { [id: string]: Player; } = {};
    public PermaLeftPlayerUniqIdDict: { [id: string]: Player; } = {};

    public playersIdOnHold: string[] = [];

    //connected but cannot play //Clicked on Drop 


    // public Board: Board = new Board();

    public ClosedDeck: Card[] = []
    public OpenDeck: Card[] = []
    public jokerCard!: Card;


    //to check who is going to declare / submit cards.
    public declarePlId: number = -1;
    // gameShouldEndNow: boolean = false;
    // public pointVal: number = 0.1;

    public winner: number = -1;

    handleTossTimeout: any = undefined;

    // gameState : GAMESTATE = GAMESTATE.MATCHMAKING;

    gameStateHandler: GameStateHandler = new GameStateHandler(this); //this is the current state handler and by default it is the matchmaking state handle

    calculatedResult: any = undefined;
    canDiscardCard: boolean = false;

    currentGameRoundId: string = '';
    stopRestart: boolean = false;
    currentGameRoundReport!: GameEndReport;

    tableTypeID!: string;
    entryFees: number = 0;
    pointsVal: number = 0;


    removeRequestHandler: RemoveRequestQueue = new RemoveRequestQueue(this);
    currentGameState: GAMESTATE = GAMESTATE.MATCHMAKING;
    hasReportSent: boolean = false;
    playersLeftDuringGameStart: Player[] = [];

    gameInStartProcess: boolean = false;
    leftPlayersForClientSending: Player[] = [];

    constructor(public tableGameId: string) {

        TableLogInit(this);
        LogMessage("Table Initialized", this);

        this.createShuffledCardDeck()
    }

    setTableTypeProperties(tableType: number) {
        this.tableTypeID = tableType.toString();
        this.entryFees = TableTypesDict[tableType].entryFee;
        this.pointsVal = TableTypesDict[tableType].onePointValue;
    }

    shuffle(array: any[]) {
        let currentIndex = array.length, randomIndex;

        // While there remain elements to shuffle...
        while (currentIndex != 0) {

            // Pick a remaining element...
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;

            // And swap it with the current element.
            [array[currentIndex], array[randomIndex]] = [
                array[randomIndex], array[currentIndex]];
        }

        return array;
    }


    currentPlayersCount: number = 0;
    isGameEnded: boolean = false;
    isWaitingForRestart: boolean = false;

    async addPlayerToRoom(pl: Player, playerBal: number) {
        LogMessage(`Adding Player ${pl.playerID} to table`, this);

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
                    LogMessage(`Player ${pl.playerID} is already in room`, this);
                    LogMessage("Closing socket because player is already in room", this);

                    console.log("Closing socket because player is already in room " + pl.playerID)

                    if (pl && pl.plSocket && pl.plSocket.isConnectionAlive) {
                        pl.sendMessage({
                            t: MSGTYPE.ERROR,
                            data: `You are already in room`,
                            showMessage: true
                        });
                        try {
                            pl.plSocket?.end();
                        }
                        catch {
                            console.log("error in closing socket")
                        }
                    }

                    return;
                }
            }
        }

        if (this.currentPlayersCount == this.maxPlayers || this.gameStarted) {
            //kicking player out 
            LogErrorToDB({
                functionName: "addPlayerToRoom",
                reason: "Unable to join full or game started table",
                properties: { playerID: pl.playerID, cTID: this.tableGameId },
                time: new Date(),
                servId: process.env.SERVERID,
                errorCode: ErrorCode.FULL_TABLE

            });

            CallUpdatePlayerStatus(parseInt(pl.playerID), GlobalPlayerState.IN_APP, "", -1, -1); //need to add this function in api Calls

            console.log("sending pl the unable to join msg " + pl.playerID)

            if (pl && pl.plSocket && pl.plSocket.isConnectionAlive) {

                pl.sendMessage({ t: MSGTYPE.ERROR, data: `Unable to join table, Error Code : ${ErrorCode.FULL_TABLE}`, code: ErrorCode.FULL_TABLE });
                pl.plSocket?.end();
            }
            try {
                pl.plSocket?.end();
            }
            catch (e) {
                //log in error stream
                console.log(e)
                console.log("Error while closing socket")
            }
            console.log("This table is already full cant join : " + ErrorCode.FULL_TABLE);

            return

        }

        this.currentPlayersCount++;
        console.log(" Before Locking Current Players Count : " + this.currentPlayersCount)

        const lockFunds = await CallLockFundsAPI(pl.playerID, playerBal, this.currentGameRoundId, true, pl.hasDeposited, undefined);

        if (!lockFunds.success) {
            console.log("Lock Funds Failed")
            LogMessage("Lock Funds Failed", this, pl);

            this.currentPlayersCount--;

            CallUpdatePlayerStatus(parseInt(pl.playerID), GlobalPlayerState.IN_APP, "", -1, -1); //function missing in api calls

            console.log("Closing socket because lock funds failed");

            if (pl && pl.plSocket && pl.plSocket.isConnectionAlive) {
                pl.sendMessage({
                    t: MSGTYPE.ERROR,
                    data: `Unable to join table,\n ${lockFunds.data}`,
                });
                try {
                    pl.plSocket?.end();
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
            LogMessage(`Player ${pl.playerID} reconnected`, this);

            this.handleRejoinPlayer(player, playerBal); //need to modify player rejpinh function

            return;
        }

        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] != null) {
                if (this.PlayersUniqIdDict[i].playerID == pl.playerID) {
                    console.log("This player is already joined")
                    LogMessage(`Player with ${pl.playerID} is already joined!`, this);
                    this.currentPlayersCount--;
                    return;
                }
            }
        }



        if ((!pl) || (!pl.plSocket) || (!pl.plSocket.isConnectionAlive)) {

            if (!pl)
                LogMessage(`Kicking Player, Reason : player is null`, this);
            else if (!pl.plSocket)
                LogMessage(`Kicking ${pl.playerID}, Reason : player socket is null`, this);
            else if (!pl.plSocket.isConnectionAlive)
                LogMessage(`Kicking ${pl.playerID}, Reason : socket not alive`, this);




            // CallLeftPlayerAPI(this.tableGameId, pl.playerID, RemovePlayerEvent.ERRORED);
            //Calling UnLockFundsAPI to unlock the funds of player as It is locked while createNewPlayerFunction in server.ts
            await CallLockFundsAPI(pl.playerID, this.entryFees, this.currentGameRoundId, false, pl.hasDeposited, "Errored while joining table");
            CallUpdatePlayerStatus(parseInt(pl.playerID), GlobalPlayerState.IN_APP, "", -1, -1); //missing function in api calls

            this.currentPlayersCount--;

            return;
        }

        this.handleJoinPlayer(pl, playerBal); //Need to add this 


        //this.currentPlayersCount++;


        clearTimeout(this.deleteTableTimeout)

        this.waitTimer = this.waitTimerVal;

        //if current players equal minimum players then start 15 second countdown to start the game.
        console.log("Current Players Count : " + this.currentPlayersCount)
        if (this.currentPlayersCount >= 1) {

            console.log("################# Restarting Wait Timer  Curr Pls:" + this.currentPlayersCount + "###################")
            if (!this.gameStarted) {
                //above check added as the timer was getting started twice in case of player's lock funds success coming at the moment 3,2,1 was started already

                clearTimeout(this.waitTimeout)
                //TLDR this should not get started twice in case of player leaves and joins
                this.waitTimeout = setTimeout(this.waitTimerLoop.bind(this), 1000)
            }
        }

        console.log("Adding Pl to room =======")


        LogMessage(`Adding player ${pl.playerID} to room`, this);


        //extra check
        // for (let i = 0; i < this.maxPlayers; i++)
        // {
        //     if (this.PlayersUniqIdDict[i] != null) {
        //         if (this.PlayersUniqIdDict[i].playerID == pl.playerID) {

        //             //Check if player is disconnected and rejoining
        //             if(this.PlayersUniqIdDict[i].isDisconnected)
        //             {
        //                 this.PlayersUniqIdDict[i].isDisconnected = false;

        //                 pl.plSocket.player = this.PlayersUniqIdDict[i];
        //                 this.PlayersUniqIdDict[i].plSocket = pl.plSocket;

        //                 this.handleRejoinPlayer(this.PlayersUniqIdDict[i]);
        //                 return;
        //             } else
        //             {
        //                 //is already in game
        //                 console.log("This player is already joined")
        //                 //send message "the player is already joined" 
        //                 const msg = {
        //                     t : "error",
        //                     msg : "This player is already joined"
        //                 }

        //                 sendToAnalytics({
        //                     collection : DBCollectionNames.GAME_EVENTS,
        //                     data : {
        //                         event : "PlayerAlreadyJoined",
        //                         playerID : pl.playerID,
        //                         tableID : this.tableGameId,
        //                         gameRoundId : this.currentGameRoundId,
        //                         time : new Date()
        //                     }
        //                 });

        //                 pl.sendMessage(msg);
        //                 pl.plSocket.close();
        //                 return;
        //             }
        //         }

        //     }
        // }
        //check in removedList also
        //send his money to pot now if not yet
        // join as dropped-- show dialog you were already removed from game 
        //Add this websocket to the reference of already dropped player
        //Add the dropped player as reference in this websocket
        //also blacklist this player

        //in blacklist 
        // join as dropped-- show dialog you were already removed from game 
        //Add this websocket to the reference of already dropped player
        //Add the dropped player as reference in this websocket




        // for (let i = 0; i < this.maxPlayers; i++)
        //     if (this.PlayersUniqIdDict[i] == null || this.PlayersUniqIdDict[i] == undefined) {

        //         this.PlayersUniqIdDict[i] = pl;
        //         pl.plRoomNetId = i;

        //         if (this.gameStarted) {
        //             pl.playerState = PLAYERSTATE.WAITING;
        //         }
        //         //  pl.assignTokens();
        //         break;
        //     }


        // pl.gRoom = this;
        // pl.balance = playerBal


        // if (this.gameStarted) {
        //     if (this.jokerCard)
        //         this.handleAddPlayer(pl, JOINEDCASE.JOINEDWHILEGAMESTARTED);
        //     else
        //         this.handleAddPlayer(pl, JOINEDCASE.JOINEDWHILETOSS);

        // } else
        // {
        //     this.handleAddPlayer(pl, JOINEDCASE.JOINEDWHILEMATCHMAKING);
        // }


        //  console.log(pl.plSocket)

    }


    handleRejoinPlayer(player: Player, playerBal: number
    ) {
        player.gRoom = this;
        player.balance = new Money(playerBal);

        let leftPlAr = []

        for (let i = 0; i < this.leftPlayersForClientSending.length; i++) {
            leftPlAr.push({
                "plId": this.leftPlayersForClientSending[i].plRoomNetId,
                "pname": this.leftPlayersForClientSending[i].plName,
                "pImg": this.leftPlayersForClientSending[i].profileImage
            })
        }

        const rejoinMsg = {
            t: MSGTYPE.REJOINED,
            plId: player.plRoomNetId,
            bal: player.balance,
            joker : this.jokerCard ? this.jokerCard.name : undefined,
            tId : this.tableGameId,
            openCard : this.OpenDeck.length > 0 ? this.OpenDeck[this.OpenDeck.length - 1].name : undefined,
            pot : this.potDistribution,
            cards : player.cardFormationString,
            lives : player.skippedTurns,
            hasSubmit : player.hasSubmitted,
            snap: this.getRoomSnap()
        }

        const playerRejoinMsg = {
            t: MSGTYPE.REJOINED,
            plId: player.plRoomNetId,
            image: player.profileImage,
            name: player.plName,
            bal: player.balance.value,


        }

        player.sendMessage(rejoinMsg);

        this.sendMessageToOthers(playerRejoinMsg, player.plRoomNetId);
    }

    handleJoinPlayer(pl: Player, playerBal: number) {
        //Assign Seat

        if (this.currentPlayersCount == 2 && this.PlayersUniqIdDict[2] == null) {
            let nextPosition = 0;
            let currPlOccPos = 0;
            for (let i = 0; i < this.maxPlayers; i++) {
                if (this.PlayersUniqIdDict[i]) {
                    currPlOccPos = i;
                    nextPosition = i + 2 > 3 ? i + 2 - 4 : i + 2;
                    break;
                }
            }

            this.PlayersUniqIdDict[nextPosition] = pl;
            pl.plRoomNetId = nextPosition;

        } else {


            for (let i = 0; i < this.maxPlayers; i++)
                if (this.PlayersUniqIdDict[i] == null) {
                    this.PlayersUniqIdDict[i] = pl;
                    pl.plRoomNetId = i;
                    //  pl.assignTokens();
                    break;
                }
        }

        pl.gRoom = this;
        pl.balance = new Money(playerBal)

        let playerAddedMsg = {
            t: MSGTYPE.PADD,
            plId: pl.plRoomNetId,
            pImage: pl.profileImage,
            pName: pl.plName,

            bal: pl.balance.value
        };
        let leftPlAr = []

        for (let i = 0; i < this.leftPlayersForClientSending.length; i++) {
            leftPlAr.push({
                "plId": this.leftPlayersForClientSending[i].plRoomNetId,
                "pname": this.leftPlayersForClientSending[i].plName,
                "pImg": this.leftPlayersForClientSending[i].profileImage
            })
        }

        //send message to player for succesful room joins
        //send his place on the map and initial game state.
        pl.sendMessage({
            t: MSGTYPE.JOINED,
            plId: pl.plRoomNetId,
            tID: this.currentGameRoundId,
            bal: pl.balance.value,
            snap: this.getRoomSnap(),
            leftPls: leftPlAr,
        });

        //send to others that player has joined
        this.sendMessageToOthers(playerAddedMsg, pl.plRoomNetId)


    }
    checkReconnectAvailability(plId: number) {
        return this.PlayersUniqIdDict[plId] && this.PlayersUniqIdDict[plId].isDisconnected && !this.isGameEnded;
    }

    getStats(): { [index: number]: { score: number, health: number } } {
        let stats: {
            [index: number]: {
                score: number,
                health: number
            }
        } = {};

        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] != null && this.PlayersUniqIdDict[i]) {
                stats[this.PlayersUniqIdDict[i].plRoomNetId] = {
                    score: this.PlayersUniqIdDict[i].score,
                    health: 3 - this.PlayersUniqIdDict[i].skippedTurns
                }
            }
        }

        return stats;
    }
    // reconnectDroppedPlayer(plId: number, wsSocket: any) {
    //     console.log("Reconnecting Attempt 1");
    //     this.PlayersUniqIdDict[plId].isDisconnected = false;

    //     wsSocket.player = this.PlayersUniqIdDict[plId];

    //     this.PlayersUniqIdDict[plId].plSocket = wsSocket;

    //     this.handleRejoinPlayer(this.PlayersUniqIdDict[plId]);


    //     //if in blacklist ---> join as dropped player
    //     //else
    //     //if in tempLeft && threeTurnSkipped then send --> join as dropped player
    //     //else
    //     // if player can be joined immediately ---> send sync messsage 
    //     //else send cannot join now msg --> will try to reconnect after 5s



    //     //Remember to remove the player from tempLeftList

    // }

    sendUpdatedGID() {

        const id = this.tableGameId + (this.currentGameRoundId.length > 0 ? "_" + this.currentGameRoundId : "");

        this.sendMessageToAll({
            t: "gId",
            gId: ConvertTextToBase64(id)
        });
    }


    removePlayerFromRoom(pl: Player, closeSocket: boolean, removeEvent: RemovePlayerEvent = RemovePlayerEvent.DISCONNECTED, unlockFunds: boolean = true) {

        if (!pl.updateRemovalEvent(removeEvent)) {
            console.log("Player " + pl.playerID + "  has state " + pl.removalEvent + " could not be updated to " + RemovePlayerEvent[removeEvent])
            return;
        }

        if (!this.PlayersUniqIdDict[pl.plRoomNetId]) {

            console.log("Player " + pl.plRoomNetId + " not in room")

            return;
        }
        else if (removeEvent == RemovePlayerEvent.DISCONNECTED && this.PlayersUniqIdDict[pl.plRoomNetId].isDisconnected) {
            LogMessage("Player already disconnected", this, pl);
            return;
        }


        //player in the wait timer 0 -10
        if (!this.gameInStartProcess) {

            removeEvent = RemovePlayerEvent.PRELEFT;

            this.waitTimer = this.waitTimerVal;
            clearTimeout(this.waitTimeout)
            console.log("################# Restarting Wait Timer ###################")
            this.waitTimeout = setTimeout(this.waitTimerLoop.bind(this), 1000)
        }
        //player in the gameinstartprocess 10+1.10+2,10+3 also deduction apis getting called
        else if (this.gameInStartProcess && !this.gameStarted) {
            removeEvent = RemovePlayerEvent.LEFT_DURING_START;
        }
        else if (this.gameStarted && removeEvent == RemovePlayerEvent.LEFT) {
            // removeEvent = RemovePlayerEvent.LEFT;

        } else if (this.isGameEnded && removeEvent == RemovePlayerEvent.DISCONNECTED) {
            removeEvent = RemovePlayerEvent.LEFT;
        }


        //Adding to Game Report
        if (this.currentGameRoundReport && this.currentGameState !== GAMESTATE.ENDED && removeEvent !== RemovePlayerEvent.DISCONNECTED) {
            this.currentGameRoundReport.leftPlayers[pl.playerID] = RemovePlayerEvent[removeEvent];
        }




        if (this.currentGameRoundId != '') {
            LogMessage(`Player Removed because of ${RemovePlayerEvent[removeEvent]} event`, this, pl);
        }


        LogMessage(`Player ${pl.playerID} removed because of ${RemovePlayerEvent[removeEvent]} event`, this);


        LogMessage(`Removing playerEvent : ${RemovePlayerEvent[removeEvent]} `, this, pl);


        if (removeEvent == RemovePlayerEvent.DISCONNECTED) {
            this.PlayersUniqIdDict[pl.plRoomNetId].isDisconnected = true;
            this.sendMessageToAll({ t: MSGTYPE.PLEFT, data: pl.plRoomNetId, playerId: pl.playerID, reason: removeEvent });

        } else if (removeEvent == RemovePlayerEvent.LEFT_DURING_START) {

            //check if pl is already in the list
            let isAlreadyInList = false;
            for (let i = 0; i < this.playersLeftDuringGameStart.length; i++) {
                if (this.playersLeftDuringGameStart[i].playerID == pl.playerID) {
                    isAlreadyInList = true;
                    LogMessage(`Player ${pl.playerID} Already found in the leftDuringStartList, Count : ${this.playersLeftDuringGameStart.length}`, this, pl);

                    break;
                }
            }

            if (!isAlreadyInList) {
                this.playersLeftDuringGameStart.push(pl);
                LogMessage(`Added To Left During Game Start List, Count : ${this.playersLeftDuringGameStart.length}`, this, pl);
            }
        } else {
            this.handlePlayerLeftProcess(pl, closeSocket, removeEvent, unlockFunds);
        }



    }


    // handleAddPlayer(pl: Player, joinedCase: JOINEDCASE) {
    //     let playerAddedMsg: any = {
    //         t: MSGTYPE.PADD,
    //         plId: pl.plRoomNetId,
    //         pImage: pl.plImage,
    //         pName: pl.plName,
    //         bal: pl.balance,
    //         currState: pl.playerState,
    //         pDefaultId: pl.playerID
    //     };


    //     let joinedMsg: any = {
    //         t: MSGTYPE.JOINED,
    //         plId: pl.plRoomNetId,
    //         bal: pl.balance,
    //         tId: this.tableGameId,
    //         snap: this.getRoomSnap(),
    //         gameState: this.gameStateHandler.GetState

    //     };

    //     pl.sendUpdatedGID();

    //     if (joinedCase == JOINEDCASE.JOINEDWHILEGAMESTARTED) {
    //         joinedMsg.gameStarted = true;
    //         joinedMsg.joker = this.jokerCard.name;
    //         joinedMsg.openCard = (this.OpenDeck.length > 0) ? this.OpenDeck[this.OpenDeck.length - 1].name : null;
    //         joinedMsg.pot = this.potDistribution;
    //     }

    //     if (joinedCase == JOINEDCASE.JOINEDWHILETOSS) {
    //         joinedMsg.gameStarted = true;
    //     }

    //     LogMessage(`[${pl.playerID}] : ` + "Sending Joined Message to player " + pl.plRoomNetId + " " + pl.plName, this, pl);

    //     pl.infoLog(`Joined Room`, { joinMsg: joinedMsg });
    //     pl.sendMessage(joinedMsg);

    //     this.sendMessageToOthers(playerAddedMsg, pl.plRoomNetId)
    //     this.currentPlayersCount++;




    //     if (joinedCase == JOINEDCASE.JOINEDWHILEMATCHMAKING) {

    //         if (this.deleteTableTimeout != undefined) {
    //             clearTimeout(this.deleteTableTimeout)
    //             this.deleteTableTimeout = undefined;


    //             if (this.gameStateHandler.GetState == GAMESTATE.RESULT) {
    //                 this.gameStateHandler.SetState(GAMESTATE.RESTARTING);

    //                 this.isWaitingForRestart = true;
    //                 this.restartTimeout = setTimeout(() => {
    //                     this.restartGame();
    //                 }, 5000);
    //             }
    //         }

    //         this.waitTimer = this.waitTimerVal;

    //         //if current players equal minimum players then start 15 second countdown to start the game.
    //         if (this.currentPlayersCount == 1) {
    //             //    console.log("Starting Wait timer AGAIN!!")
    //             clearTimeout(this.waitTimeout)
    //             //TLDR this should not get started twice in case of player leaves and joins
    //             this.waitTimeout = setTimeout(this.waitTimerLoop.bind(this), 1000)
    //         }
    //     }



    //     console.log("Adding Pl to room =======")

    // }




    async startTheGame() {
        console.log("############  Starting the game   #############")

        LogMessage(`Starting Game....`, this,);

        this.currentGameState = GAMESTATE.STARTED;
        const playerIds: string[] = [];

        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i]) {
                playerIds.push(this.PlayersUniqIdDict[i].playerID);
                // if(this.PlayersUniqIdDict[i].playerID === "263079") {
                //     this.gameTimerVal = 30;
                // }
            }
        }
        // LogMessage("Starting the game...", this);

        // const playerIds : string[]  = [];
        // for(let i = 0; i < this.maxPlayers; i++)
        // {
        //     if(this.PlayersUniqIdDict[i])
        //     {
        //         playerIds.push(this.PlayersUniqIdDict[i].playerID);
        //     }
        // }


        // const startResult = await sendGameStartedAlert(this.tableGameId, playerIds);

        // if(!startResult)
        // {
        //     this.closeTable("Starting Game Failed", "Enable to mark game started on MS", true);
        //     return;
        // }



        // LogMessage("New Round Id : " + startResult.gameRoundId, this);

        // this.setTableTypeProperties(startResult.tableTypeId);

        // this.currentGameRoundId = startResult.gameRoundId;

        // this.sendUpdatedGID();
        // LogInit(this);
        // LogMessage(`New Session Id Generated : ${this.currentGameRoundId}`, this);

        // this.currentGameRoundReport = {
        //     tableId : this.tableGameId,
        //     gameRoundId : this.currentGameRoundId,
        //     startTime : new Date(),
        //     endTime : undefined,
        //     players : [],
        //     waitingPlayers : [],
        //     result : {},
        //     gameData : {
        //         joker : '',
        //     },
        //     isEndedCleanly : true,
        //     reason : undefined
        // };

        // LogMessage(JSON.stringify(this.currentGameRoundReport), this);

        // LogGameStateToDB(LogGameStates.GAME_STARTED, this);

        // for(let i = 0; i < this.maxPlayers; i++)
        // {
        //     let pl = this.PlayersUniqIdDict[i];

        //     if(pl)
        //     {
        //         this.currentGameRoundReport.players.push(pl.playerID);
        //     }
        // }

        // this.startRummy();

        LogMessage(`New Session Id Generated : ${this.currentGameRoundId}`, this);

        this.currentGameRoundReport = {
            tableId: this.tableGameId + "",
            gameRoundId: this.currentGameRoundId,
            startTime: new Date(),
            endTime: undefined,
            players: [],
            waitingPlayers: [],
            gameData: {},
            result: {},
            isEndedCleanly: true,
            reason: undefined,
            entryFees: {},
            leftPlayers: {}
        };

        LogMessage(JSON.stringify(this.currentGameRoundReport), this);

        LogGameStateToDB(LogGameStates.GAME_STARTED, this); //Log To DB
        // }
        console.log("################# Deductions Started ###################");
        // TLDR Player should not be able to run back 
        let potAmt: Money = new Money(0);
        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i]) {
                // let waitCallUpdate = await callUpdateCoinWalletAPI(this.PlayersUniqIdDict[i].playerID, GamesappGameID, this.tableGameId, (-1 * entryFee).toString(), "PLAYER_BET", true, "Ludo test BET", this.currentGameSession);
                const player = this.PlayersUniqIdDict[i];
                LogMessage("Deducting Balance " + this.entryFees.toString(), this, player);
                console.log("################# Deducting Balance #########" + player.playerID + "##########");

                let deductApiResponse = await CallDebitWalletAPI(player.playerID, this.entryFees, this.currentGameRoundId);
                if (!deductApiResponse.status) {
                    LogMessage("Deducting balance failed..." + deductApiResponse.message, this, player);
                    console.log("################# Deducting balance FAILED #########" + player.playerID + "##########");

                    player.sendMessage({
                        t: MSGTYPE.ERROR,
                        msg: "Deducting balance failed! Kicking Player..." + deductApiResponse.message
                    });

                    this.removePlayerFromRoom(player, true, RemovePlayerEvent.ERRORED);
                    continue;
                }

                this.currentGameRoundReport.entryFees[player.playerID] = this.entryFees;
                console.log("################# Deducting Success #########" + player.playerID + "##########");

                LogMessage(`Deduction Success : ${JSON.stringify(deductApiResponse)}`, this, player);

                player.hasDeposited = true;
                potAmt.add(new Money(this.entryFees));

                this.currentGameRoundReport.players.push(player.playerID);

                LogMessage("Added to report list", this, player);
            }
        }



        //playersLeftDuringGameStart in this list the lowest player has left at the end


        if (this.playersLeftDuringGameStart.length == this.currentPlayersCount) {

            //show player Ids of players who left
            let plIdsLeftsLog = ""
            for (let i = 0; i < this.playersLeftDuringGameStart.length; i++) {
                plIdsLeftsLog += this.playersLeftDuringGameStart[i].playerID + ","
            }

            console.log("################# Players Left Before Start: " + plIdsLeftsLog + " ###################");

            let playersWhoDeposited = []
            //everyone left
            // we need to filter the players who have actually deposited the money
            for (let i = 0; i < this.playersLeftDuringGameStart.length; i++) {
                let playerId = this.playersLeftDuringGameStart[i].playerID
                if (this.currentGameRoundReport.entryFees[playerId]) {

                    playersWhoDeposited.push(this.playersLeftDuringGameStart[i])
                } else {
                    console.log("################# handlePlayerLeftProcess No Deposit: " + this.playersLeftDuringGameStart[i].playerID + " ###################");

                    await this.handlePlayerLeftProcess(this.playersLeftDuringGameStart[i], true, RemovePlayerEvent.LEFT_DURING_START, true);

                }
            }
            let plIdsDepositedLog = ""
            for (let i = 0; i < playersWhoDeposited.length; i++) {
                plIdsDepositedLog += playersWhoDeposited[i].playerID + ","
            }



            console.log("################# Players Who Deposited: " + plIdsDepositedLog + " ###################");

            //commented code to let it declare the result and end the game as the result in all left before start is draw.
            //Removing other players cause error when sending money to them.
            // if (playersWhoDeposited.length != 0) {
            //     let winnerPlayer = playersWhoDeposited[playersWhoDeposited.length - 1]

            //     //now end the ludo game with this player
            //     for (let i = 0; i < playersWhoDeposited.length; i++) {
            //         if (playersWhoDeposited[i].playerID != winnerPlayer.playerID) {
            //             this.handlePlayerLeftProcess(playersWhoDeposited[i], true, RemovePlayerEvent.LEFT_DURING_START, true);
            //         }
            //     }
            // }
            //then find a winner who left at end
            this.endRummyGame({}, GAMEENDCONDITION.ALLLEFTBEFORESTART);
            return;
        }
        else {
            //one player is there others have left or more than 1 player is there
            //just kick the left players  the pending player will bve declared winner in startLudo function
            for (let i = 0; i < this.playersLeftDuringGameStart.length; i++) {

                if (this.playersLeftDuringGameStart[i]) {
                    LogMessage(`Player Left During Game Start : ${this.playersLeftDuringGameStart[i].playerID}, Kicking Now`, this, this.playersLeftDuringGameStart[i]);
                    this.handlePlayerLeftProcess(this.playersLeftDuringGameStart[i], true, RemovePlayerEvent.LEFT, true);

                }
            }

        }


        LogGameStateToDB(LogGameStates.MONEY_DEDUCTED, this);


        if (this.currentPlayersCount == 0) {
            console.log("################# No Players Left ###################");

            // Sending game round report because no players are left before game started as Their was some error in deducting balance
            // Usually if game round report is not sent then game stucks in starting state on load balancer
            this.sendGameRoundReport("No Players Left");


        } else {
            console.log("################# StartLudo Function ###################");

            this.startRummy();

        }

    }
    sendGameRoundReport(reason: string) {
        //if is game started on lb is true then game round report is already sent
        // if(this.isGameStartedOnLB)
        //     this.isGameStartedOnLB = false;

        if (this.hasReportSent) {
            LogMessage("Game Round Report Already Sent", this);
            return;
        }

        LogMessage("Sending Game Round Report, reason=" + reason, this);

        this.currentGameRoundReport.endTime = new Date();
        this.currentGameRoundReport.isEndedCleanly = true;

        LogMessage(JSON.stringify(this.currentGameRoundReport), this);

        this.hasReportSent = true;
        sendToAnalytics({
            collection: DBCollectionNames.GAME_ROUND_REPORTS,
            data: {
                report: this.currentGameRoundReport,
                time: new Date(),
                serverId: process.env.SERVERID,
                gameRoundId: this.currentGameRoundId,
            }
        });
        // CallGameRoundReportAPI(this.tableGameId, this.currentGameRoundId, undefined, true, this.currentGameReport);
    }

    handleLeaveBtnClick(pl: Player) {
        LogMessage("Player Left", this, pl);
        this.removePlayerFromRoom(pl, true, RemovePlayerEvent.LEFT);
    }



    handlePlayerLeftProcess(pl: Player, closeSocket: boolean, removeEvent: RemovePlayerEvent, unlockFunds: boolean) {

        let request = {
            pl: pl,
            closeSocket: closeSocket,
            removeEvent: removeEvent,
            unlockFunds: unlockFunds
        }
        this.HandleLeftProcessQueue.push(request);



    }

    resultCalculationStarted: boolean = false;
    HandleLeftProcessQueue: any[] = []
    isInHandlingLeftQueueProcess: boolean = false;

    async processHandleLeftQueue() {

        if (this.resultCalculationStarted)
            return;

        this.isInHandlingLeftQueueProcess = true
        let flagGameShouldEndOnlyOnePlayerLeft = false;

        while (this.HandleLeftProcessQueue.length > 0) {

            if (this.resultCalculationStarted)
                break;

            let request = this.HandleLeftProcessQueue.shift();
            console.log("**handlePlayerLeftProcessExecute " + " length =(" + this.HandleLeftProcessQueue.length + ") pl = " + request.pl.playerID)

            await this.handlePlayerLeftProcessExecute(request.pl, request.closeSocket, request.removeEvent, request.unlockFunds);
            console.log("**handlePlayerLeftProcessExecute DONE " + " length =(" + this.HandleLeftProcessQueue.length + ") pl = " + request.pl.playerID)


            if (this.currentPlayersCount == 1 && this.gameStarted && !this.isGameEnded) {
                flagGameShouldEndOnlyOnePlayerLeft = true;
                break
            }

        }

        this.isInHandlingLeftQueueProcess = false

        if (flagGameShouldEndOnlyOnePlayerLeft) {
            await this.endRummyGame({}, GAMEENDCONDITION.ALLOPPONENTLEFT)
        }

    }


    setIntervalForProcessHandleLeftQueue() {
        setInterval(() => {
            if (this.HandleLeftProcessQueue.length > 0 && !this.isInHandlingLeftQueueProcess)
                this.processHandleLeftQueue();
        }, 1000);
    }

    async handlePlayerLeftProcessExecute(pl: Player, closeSocket: boolean, removeEvent: RemovePlayerEvent, unlockFunds: boolean) {


        console.log("handlePlayerLeftProcess " + pl.playerID)

        if (unlockFunds) {
            let gameEndReason = '';

            if (pl.resultReason != '') {
                gameEndReason = pl.resultReason;
            } else if (pl.hasDeposited)
                gameEndReason = (removeEvent == RemovePlayerEvent.TIMEOUT ? `You lost because you skipped three times.` : `You lost because you left the game midway.`);
            // let hasPlDeposited = this.currentGameReport ? this.currentGameReport.players.includes(pl.playerID) : false;
            await CallLockFundsAPI(pl.playerID, 0, Table.currentGameRoundId, false, pl.hasDeposited, gameEndReason);
        }
        CallUpdatePlayerStatus(parseInt(pl.playerID), GlobalPlayerState.IN_APP, "", -1, -1);

//TODO : Ask about this

        for (let key of Object.keys(this.board.Tokens)) {
            let token = this.board.Tokens[key];

            if (token.tokenType == pl.plRoomNetId) {
                this.board.Tokens[key].score = 0;
                addTokenToPlace(this.board.Tokens[key], this.board.Tokens[key].startPos.postionNum, this.board)
                this.board.Tokens[key].score = 0;

            }
        }


        if (this.gameInStartProcess)
            this.leftPlayersForClientSending.push(pl);


        delete this.PlayersUniqIdDict[pl.plRoomNetId];
        this.sendMessageToAll({ t: MSGTYPE.PLEFT, data: pl.plRoomNetId, reason: removeEvent });


        if (pl.plRoomNetId != -1)
            this.currentPlayersCount--;

        console.log("After pl left " + pl.playerID + " currentPlayersCount", this.currentPlayersCount);

        if (closeSocket && pl.plSocket.isConnectionAlive) {
            console.log("Closing socket in handle player left process");
            try {
                pl.plSocket?.end();
            }
            catch (e) {
                console.log(e);
            }
        }


        // if (this.currentPlayersCount == 1 && this.gameStarted && !this.isGameEnded) {
        //     await this.endLudoGame({}, GAMEENDCONDITION.ALLOPPONENTLEFT)
        // }


    }




    // async handleSwitchTable(pl: Player) {


    //     if (this.stopRestart || this.gameInStartProcess) {
    //         console.log("Restarting in progress");

    //         pl.sendMessage({
    //             t: "switchFailed"
    //         });

    //         return;
    //     }


    //     pl.sendMessage({
    //         t: MSGTYPE.SWITCH_SUCCESS,
    //         id: ServerID
    //     });

    //     this.removePlayerFromRoom(pl, false, RemovePlayerEvent.SWITCHED);
    //     console.log("Switching Table");
    // }

    // async handleChargePlayer(pl: Player, amount: number, reason: string) {

    //     amount = Math.trunc((amount * 100)) / 100;

    //     console.log("CHARGING " + pl.playerID + " " + (-1 * amount).toString() + " REASON = " + reason)
    //     LogMessage("CHARGING " + (-1 * amount).toString() + " REASON = " + reason, this, pl);
    //     pl.isCharged = true

    //     let result = await CallDeductBalanceAPI(amount.toString(), pl.playerID, this.tableGameId, reason, this.currentGameRoundId, TxReasons.LOSE);

    //     if (result) {

    //         console.log("Adding to potDistribution " + amount);
    //         this.potDistribution += amount;

    //         LogMessage("Adding to potDistribution " + amount, this, pl);
    //         LogMessage("Pot Distribution : " + this.potDistribution, this, pl);

    //         pl.balance = result.balance;

    //         this.sendMessageToAll({
    //             t: "potUpdate", amt: this.potDistribution, data: {
    //                 plId: pl.plRoomNetId,
    //                 bal: pl.balance
    //             }
    //         });

    //         pl.infoLog("Charged", { amount: amount, reason: reason, balance: pl.balance, potDistribution: this.potDistribution });

    //         LogGameStateToDB(LogGameStates.MONEY_DEDUCTED, this, { playerID: pl.playerID, amount: amount, isSuccess: true });
    //     } else {
    //         this.currentGameRoundReport.isEndedCleanly = false;
    //         LogGameStateToDB(LogGameStates.MONEY_DEDUCTED, this, { playerID: pl.playerID, amount: amount, isSuccess: false });
    //         LogBalanceDeductFail("Charge Amount", pl.playerID, this.tableGameId, this.currentGameRoundId, amount);
    //     }

    // }
    // async handleRewardPlayer(pl: Player, amount: number, reason: string): Promise<number | null> {
    //     console.log("REWARDING " + pl.playerID + "  " + (amount).toString() + " REASON = " + reason)
    //     LogMessage("REWARDING " + (amount).toString() + " REASON = " + reason, this, pl);
    //     pl.isCharged = true

    //     let result = await CallCreditBalanceAPI(amount.toString(), pl.playerID, this.tableGameId, this.currentGameRoundId, TxReasons.WIN);

    //     if (result != undefined && result != null) {
    //         this.potDistribution -= amount;
    //         pl.balance = result.balance;
    //         pl.reward = amount - result.rake;
    //         this.sendMessageToAll({
    //             t: "potUpdate", amt: this.potDistribution, data: {
    //                 plId: pl.plRoomNetId,
    //                 bal: pl.balance
    //             }
    //         });

    //         pl.infoLog("Rewarded", { amount: amount, reason: reason, balance: pl.balance, potDistribution: this.potDistribution });

    //         LogGameStateToDB(LogGameStates.MONEY_CREDITED, this, { playerID: pl.playerID, amount: pl.reward, isSuccess: true });
    //         return result.rake;
    //     } else {
    //         this.currentGameRoundReport.isEndedCleanly = false;
    //         LogGameStateToDB(LogGameStates.MONEY_CREDITED, this, { playerID: pl.playerID, amount: amount, isSuccess: false });
    //         return null;
    //     }

    // }

    handlePlayerClickLeaver(pl: Player) {


        // if(pl.playerState == PLAYERSTATE.WAITING || !this.gameStarted)
        // {

        // } else
        // {
        //     this.addToPermaLeft(pl);
        // }

        // LogMessage("Player Clicked Leaver", this, pl);

        pl.infoLog("Player Clicked Leaver", { playerState: pl.playerState, gameStarted: this.gameStarted });
        const removeReq = new RemoveRequest(pl, LeaveState.LEAVE_CLICKED);
        this.removeRequestHandler.AddRequest(removeReq);

        // this.removePlayerFromRoom(pl, RemovePlayerEvent.LEFT);

        // this.sendMessageToAll({ t: MSGTYPE.PLEFT, data: pl.plRoomNetId })
    }

    addToPermaLeft(pl: Player) {
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


    onSocketClose(pl: Player) {

        LogMessage("Socket Closed", this, pl);

        const removeReq = new RemoveRequest(pl, LeaveState.WS_DISCONNECT);
        this.removeRequestHandler.AddRequest(removeReq)

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

    // startDestroyTimer() {
    //     if (this.currentPlayersCount <= 0) {
    //         LogMessage("Starting Destroy Timer", this);
    //         this.deleteTableTimeout = setTimeout(() => {
    //             LogMessage("Closing the table", this);

    //             this.closeTableImmediate(`Current Player Count is ${this.currentPlayersCount}`, false);
    //         }, 5000);
    //     }
    // }

    // async checkIfNeedToEndGame() {
    //     LogMessage("Checking if need to end game", this);


    //     if (this.activePlayersCount == 1 && this.gameStarted == true && !this.isGameEnded)// && this.winner == -1)
    //     {
    //         LogMessage("Ending Game", this);
    //         await this.endRummyGame({}, GAMEENDCONDITION.ALLOPPONENTLEFT)
    //     } else {
    //         LogMessage("Not Ending Game", this);

    //         LogMessage("Active Players Count = " + this.activePlayersCount, this);
    //         LogMessage("Game Started = " + this.gameStarted, this);
    //         LogMessage("Is Game Ended = " + this.isGameEnded, this);
    //         LogMessage("Winner = " + this.winner, this);
    //     }

    // }

    // performPlayerCountChecks() {
    //     LogMessage("Performing Player Count Checks", this);

    //     if (this.gameStateHandler.GetState != GAMESTATE.MATCHMAKING && this.gameStateHandler.GetState != GAMESTATE.RESULT && this.gameStateHandler.GetState != GAMESTATE.RESTARTING) {
    //         this.checkIfNeedToEndGame();
    //     }


    //     this.startDestroyTimer();
    // }


    async endRummyGame(arg0: {}, condition: GAMEENDCONDITION) {

        LogMessage("Ending Rummy Game", this);
        clearTimeout(this.turnTimeout);

        if (this.handleTossTimeout) {
            clearTimeout(this.handleTossTimeout);
        }


        this.isGameEnded = true;

        let finalPlayerIndex: number = -1;

        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] &&
                (this.PlayersUniqIdDict[i].playerState == PLAYERSTATE.INGAME) &&
                !this.PlayersUniqIdDict[i].isBlacklisted) {
                finalPlayerIndex = i;
            }
        }

        if (finalPlayerIndex > -1) {
            this.sendMessageToAll({ t: "gameEnd", data: condition })
            //this.PlayersUniqIdDict[finalPlayerIndex].sendMessage({ t: "gameEnd", data: condition });

            LogMessage("Game Ended with " + condition + " , Making Winner", this, this.PlayersUniqIdDict[finalPlayerIndex]);

            if (this.PlayersUniqIdDict[finalPlayerIndex].finalTurnTimeout) {
                // @ts-ignore: Unreachable code error
                clearTimeout(this.PlayersUniqIdDict[finalPlayerIndex].finalTurnTimeout);
            }

            this.winner = finalPlayerIndex;
            this.PlayersUniqIdDict[finalPlayerIndex].result = "win";
            this.PlayersUniqIdDict[finalPlayerIndex].lostPoints = 0;
        }


        await this.handleResult(condition);

    }



    // closeTableImmediate(reason: string, isErrored: boolean) {
    //     console.log("closing the table method")
    //     LogMessage("Closing the table - " + reason, this);
    //     //call player left for dropped players



    //     clearTimeout(this.turnTimeout)
    //     clearTimeout(this.gamePlayTimeout)
    //     clearTimeout(this.waitTimeout)
    //     console.log("closing callEndGameAlertAPI")

    //     CallCloseTableAPI(this.tableGameId, this.currentGameRoundId, {
    //         isErrored: isErrored,
    //         reason: reason
    //     });

    //     // callEndGameAlertAPI(this.tableGameId, reason, isErrored)
    //     console.log("delete from GameRoomsDict")

    //     delete GameRoomsDict[this.tableGameId]

    // }


    // async closeTable(errorData: string = "", reason: string, isErrored: boolean) {
    //     console.log("closing the table method")

    //     LogMessage("Closing the table - " + reason, this);
    //     this.sendMessageToAll({ t: MSGTYPE.ERROR, data: errorData })
    //     clearTimeout(this.turnTimeout)
    //     clearTimeout(this.gamePlayTimeout)
    //     clearTimeout(this.waitTimeout)
    //     console.log("closing callEndGameAlertAPI")
    //     await CallCloseTableAPI(this.tableGameId, this.currentGameRoundId, {
    //         isErrored: isErrored,
    //         reason: reason
    //     });

    //     console.log("delete GameRoomsDict")

    //     const playerList = this.PlayersUniqIdDict;

    //     delete GameRoomsDict[this.tableGameId]

    //     Object.values(playerList).forEach(player => {

    //         if (player) {
    //             const errReq: ErrorRequest = {
    //                 msg: "Game Ended",
    //                 code: ErrorCode.NULL,
    //             }

    //             const removeReq = new RemoveRequest(player, LeaveState.ERROR, errReq);

    //             this.removeRequestHandler.AddRequest(removeReq);
    //         }

    //         // this.removePlayerFromRoom(player, RemovePlayerEvent.ERRORED);
    //         // player.gRoom = null;
    //     });

    // }

    sendMessageToOthers(content: any, plRoomNetId: number) {
        for (let i = 0; i < this.maxPlayers; i++)
            if (this.PlayersUniqIdDict[i] != null && i != plRoomNetId && this.PlayersUniqIdDict[i]) {
                this.PlayersUniqIdDict[i].sendMessage(content);
            }
    }

    sendMessageToAll(content: any) {
        for (let i = 0; i < this.maxPlayers; i++)
            if (this.PlayersUniqIdDict[i] != null)
                this.PlayersUniqIdDict[i].sendMessage(content);

    }

    getRoomSnap(withRoomId: boolean = true) {

        // other players with colors , names and profile pic urls
        let snap = []

        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] != null && this.PlayersUniqIdDict[i]) {

                let msg: any = { pName: this.PlayersUniqIdDict[i].plName, pImage: this.PlayersUniqIdDict[i].plImage, pBal: this.PlayersUniqIdDict[i].balance, pState: this.PlayersUniqIdDict[i].playerState, pDefaultId: this.PlayersUniqIdDict[i].playerID }
                if (withRoomId) {
                    msg.plId = i;
                }
                snap.push(msg)
            }
        }
        return snap
    }

    gamePlayTimeout!: NodeJS.Timeout
    turnTimeout!: NodeJS.Timeout;
    restartTimeout: any = undefined;
    waitTimeout!: NodeJS.Timeout;
    deleteTableTimeout!: NodeJS.Timeout;
    // gamePlayTimer: any = this.gameTimerVal;
    gameStarted: boolean = false;

    startRummy() {
        LogMessage("Game Started", this);
        LogGameStateToDB(LogGameStates.GAME_STARTED, this);


        if (this.currentPlayersCount == 1 || this.activePlayersCount == 1) {
            this.endRummyGame({}, GAMEENDCONDITION.ALLOPPONENTLEFT)
        } else {
            this.isGameEnded = false;
            this.gameStarted = true;
            // this.gameState = GAMESTATE.TOSS;
            this.gameStateHandler.SetState(GAMESTATE.TOSS);
            LogMessage(`Game State is ${this.gameStateHandler.GetState}`, this);


            let gameStartMsg: any = {
                t: MSGTYPE.GAMESTARTMSG,
                snap: this.getRoomSnap(true),
                //     turn: this.currPlAtTurn.plRoomNetId,
            }

            for (let i = 0; i < this.maxPlayers; i++)
                if (this.PlayersUniqIdDict[i] != null && !this.PlayersUniqIdDict[i].isBlacklisted) {
                    gameStartMsg.plId = i;
                    this.PlayersUniqIdDict[i].sendMessage(gameStartMsg);
                }

            clearTimeout(this.gamePlayTimeout)
            clearTimeout(this.turnTimeout)
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
        let tossResultMsg: any = {
            t: MSGTYPE.TOSSRESULTMSG,
            cards: { "0": "", "1": "", "2": "", "3": "", "4": "", "5": "" }
        }

        //pull a card for each player
        let possibleNums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

        let winningPl = { id: -1, cardval: 0 }
        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] != null && !this.PlayersUniqIdDict[i].isBlacklisted) {
                let randIndex = Math.floor(Math.random() * possibleNums.length)
                tossResultMsg.cards[i.toString()] = (possibleNums[randIndex])
                if (winningPl.cardval < possibleNums[randIndex]) {
                    winningPl.id = i
                    winningPl.cardval = possibleNums[randIndex]
                }

                possibleNums.splice(randIndex, 1)

            }
        }
        tossResultMsg.winner = winningPl.id

        LogMessage(`Toss Result is ${winningPl.id}`, this);

        this.sendMessageToAll(tossResultMsg)
        console.log("Player win the toss " + winningPl.id)

        try // Added try catch to handle the error of this.PlayersUniqIdDict[winningPl.id] is undefined
        {
            this.currPlAtTurn = this.PlayersUniqIdDict[winningPl.id]
            this.PlayersUniqIdDict[winningPl.id].noOfTurns++;
        } catch (e: any) {
            sendToAnalytics({
                collection: DBCollectionNames.UnexpectedErrors,
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
        let randIndex = Math.floor(Math.random() * this.ClosedDeck.length)

        this.jokerCard = (this.ClosedDeck[randIndex])

        if (this.jokerCard.name.split("-")[0] == '0') {
            console.log("Assign A instead of Joker!");

            randIndex = this.ClosedDeck.findIndex(item => item.name == "1-1");
            this.jokerCard = (this.ClosedDeck[randIndex]);
        }

        this.currentGameRoundReport.gameData.joker = this.jokerCard.name;

        this.ClosedDeck.splice(randIndex, 1);

        //opening card
        let card = this.ClosedDeck[0]
        this.OpenDeck.push(card)
        this.ClosedDeck.splice(0, 1)

        //distribute cards
        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] != null && !this.PlayersUniqIdDict[i].isBlacklisted) {
                let plCardsMsg: any = {
                    t: "plCardsMsg",
                    cards: [],
                    joker: this.jokerCard.name,
                    openCard: this.OpenDeck[0].name
                }

                for (let j = 0; j < 13; j++) {
                    let randIndex = Math.floor(Math.random() * this.ClosedDeck.length);

                    this.PlayersUniqIdDict[i].addCardToDeck(this.ClosedDeck[randIndex]);

                    plCardsMsg.cards.push(this.ClosedDeck[randIndex].name)

                    this.ClosedDeck.splice(randIndex, 1);
                }
                setTimeout(() => { if (this.PlayersUniqIdDict[i]) this.PlayersUniqIdDict[i].sendMessage(plCardsMsg) }, 1000);

                this.PlayersUniqIdDict[i].infoLog(`Cards Distributed`, { cards: JSON.stringify(plCardsMsg.cards) });
                LogMessage(`Player ${i} cards are ${JSON.stringify(plCardsMsg.cards)}`, this);

            } else if (this.PlayersUniqIdDict[i] != null && this.PlayersUniqIdDict[i].isBlacklisted) {

                let plGameData: any = {
                    t: "plGameData",
                    joker: this.jokerCard.name,
                    openCard: this.OpenDeck[0].name
                }

                this.PlayersUniqIdDict[i].sendMessage(plGameData);

            }
        }







        setTimeout(() => {

            if (this.isGameEnded) {
                //This is added because if game ends due to All Opponent left before this timeout, then we don't want to start the game
                return;
            }

            LogMessage("Scheduling Turn Timeout", this);
            // this.gamePlayTimeout = setTimeout(this.gamePlayLoop.bind(this), 1000)
            // this.gameState = GAMESTATE.INGAME;
            this.gameStateHandler.SetState(GAMESTATE.IN_GAME);
            this.turnTimeout = setTimeout(this.turnTimerLoop.bind(this), 1000)

        }, 4000);


    }


    pickACard() {

    }

    async handleCardPicked(pl: Player, type: string, cardPickClickMsg: any) {

        if (this.gameStateHandler.GetState != GAMESTATE.IN_GAME) {
            LogMessage("Game is not in ingame state", this);
            return;
        }

        if (this.currPlAtTurn != pl) {
            LogMessage(`Player ${pl.playerID} is not at turn`, this);
            return;
        }

        //check if player can pick the card
        if (pl.lastPickedCard != undefined) {
            LogMessage(`Player ${pl.playerID} has already picked a card`, this);
            return;
        }

        let cardPicked!: Card;

        this.sendMessageToOthers(cardPickClickMsg, pl.plRoomNetId)
        if (type == "close") {
            // pick card from closed deck
            //let randIndex = Math.floor(Math.random() * this.ClosedDeck.length)
            cardPicked = (this.ClosedDeck[0]);
            pl.addCardToDeck(cardPicked);
            this.ClosedDeck.splice(0, 1)
        }
        else if (type == "open") {
            //pick card from open deck
            cardPicked = (this.OpenDeck[this.OpenDeck.length - 1])
            pl.addCardToDeck(cardPicked);
            this.OpenDeck.splice(this.OpenDeck.length - 1, 1)
        }



        pl.lastPickedCard = cardPicked;


        try {

            let cardPickResponse = {
                t: "cardPickRespMsg",
                plId: pl.plRoomNetId,
                card: pl.lastPickedCard.name
            }


            pl.infoLog(`Card Picked`, { card: cardPickResponse.card, deck: type });

            this.canDiscardCard = true;
            LogMessage(`Player ${pl.plRoomNetId} picked card ${cardPicked.name} from ${type} deck`, this, pl);
            pl.sendMessage(cardPickResponse);
        } catch (er) {
            await sendToAnalytics({
                collection: DBCollectionNames.UnexpectedErrors,
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

    }

    handleCardDiscard(pl: Player, discard: string, cardsFormation: any[], finishGame: boolean) {

        if (this.gameStateHandler.GetState != GAMESTATE.IN_GAME) {
            LogMessage(`Player ${pl.playerID} tried to discard card when game is not in ingame state`, this);
            return;
        }

        if (this.currPlAtTurn != pl || !this.canDiscardCard) {
            console.log("Invalid Discard Request from Non Current Turn Player");
            return;
        }



        LogMessage(`Player ${pl.plRoomNetId} Discarded ${discard}`, this, pl);


        const discardCard = Card.convertToCard(discard);


        if (!pl.checkIfCardExists(discardCard)) {
            // LogMessage("discard card" + discard)
            // console.log("invalid card sent for discarding");

            LogMessage(`Player ${pl.plRoomNetId} sent invalid card for discarding`, this, pl);
            return
        }


        this.canDiscardCard = false;
        clearTimeout(this.turnTimeout);
        pl.lastPickedCard = undefined;



        this.checkIfNeedToFlipCards();

        this.OpenDeck.push(discardCard);

        pl.removeCardFromDeck(discardCard);

        // if (pl.finalCardsFormation.length == 0)
        LogMessage(`Player ${pl.plRoomNetId} Discarded ${discard} with FinishGame=${finishGame}`, this, pl);
        LogMessage(`Player ${pl.plRoomNetId} Cards Formation ${cardsFormation}`, this, pl);

        pl.infoLog(`Discarded Card`, { card: discard, finishGame: finishGame, cardsFormation: JSON.stringify(cardsFormation) });

        pl.updateDeckFormation(cardsFormation);


        // pl.finalCardsFormation = cardsFormation;




        if (!finishGame) {
            console.log("Calling Next Turn from Discard :" + this.currentGameRoundId);

            if (this.gameStateHandler.GetState != GAMESTATE.IN_GAME) {
                LogMessage(`Game is not in ingame state finish game can't Start turn Timer`, this);
                return;
            }

            let nextPlayerTurnMsg = {
                t: "nextPlayerTurnMsg",
                plId: this.getNextPlayerForTurn(),
                openDeck: discardCard.name
            }
            this.sendMessageToAll(nextPlayerTurnMsg)
            this.turnTimer = this.turnTimeVal;
            this.extraTimer = this.extraTimeVal;
            this.turnTimeout = setTimeout(this.turnTimerLoop.bind(this), 1000)
        }
        else {

            if (this.declarePlId != -1)
                return;
            this.declarePlId = pl.plRoomNetId;



            this.gameStateHandler.SetState(GAMESTATE.FINISHING);

            // this.gameState = GAMESTATE.FINISHING;


            let gameFinishMsg = {
                t: "gameFinishMsg",
                plId: pl.plRoomNetId,
                timeLeft: pl.savedTime + 30
            }

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
                    } else {
                        this.handleDeclare(pl, pl.cardFormationString);
                    }
                }
            }, (pl.savedTime + 32) * 1000);

            pl.finalTurnTimeoutKeeper = new TimeoutKeeper((pl.savedTime + 32) * 1000, pl.finalTurnTimeout);

        }

    }

    // async handleDroppedGame(pl: Player, cardsFormation: any[]) {


    //     if (this.currPlAtTurn.plRoomNetId != pl.plRoomNetId) {
    //         return;
    //     }

    //     LogMessage(`Player ${pl.plRoomNetId} Dropped Game`, this, pl);

    //     clearTimeout(this.turnTimeout);

    //     pl.infoLog(`Dropped Game`, { cardsFormation: JSON.stringify(cardsFormation) });

    //     pl.playerState = PLAYERSTATE.DROPPED;


    //     pl.updateDeckFormation(cardsFormation);

    //     // pl.finalCardsFormation = cardsFormation;
    //     pl.lostPoints = (pl.noOfTurns < 2) ? 20 : 40;
    //     pl.result = "dropped";

    //     await this.handleChargePlayer(pl, pl.lostPoints * this.pointsVal, "Player Dropped");

    //     // this.potDistribution += pl.lostPoints;

    //     let droppedPlayerMsg = { t: "plDropped", plId: pl.plRoomNetId, lostPoints: pl.lostPoints, amt: -Math.trunc(pl.lostPoints * this.pointsVal * 100) / 100, cards: pl.cardFormationString }


    //     this.sendMessageToAll(droppedPlayerMsg)

    //     // this.blacklist.push(pl.plRoomNetId);

    //     // this.removePlayerFromRoom(pl);

    //     //if alone player left then make last player winner

    //     if (this.activePlayersCount == 1) {
    //         this.endRummyGame({}, GAMEENDCONDITION.OPPONENTINVALIDDECLARE);
    //     } else {

    //         console.log("Calling Get Next Player for Turn from Dropped Game : " + this.currentGameRoundId);
    //         let nextPlayerTurnMsg = {
    //             t: "nextPlayerTurnMsg",
    //             plId: this.getNextPlayerForTurn(),
    //             openDeck: this.OpenDeck[this.OpenDeck.length - 1].name
    //         }

    //         this.sendMessageToAll(nextPlayerTurnMsg)
    //         this.turnTimer = this.turnTimeVal;
    //         this.extraTimer = this.extraTimeVal;
    //         this.turnTimeout = setTimeout(this.turnTimerLoop.bind(this), 1000)
    //     }
    // }


    turnTimerLoop() {

        LogMessage(`Turn Timer Loop`, this, this.currPlAtTurn);

        if (this.currPlAtTurn && this.PlayersUniqIdDict[this.currPlAtTurn.plRoomNetId]) {

            if (this.turnTimer == 0 && this.currPlAtTurn.savedTime > 0) {

                LogMessage(`Player ${this.currPlAtTurn.playerID} decreasing saved time.`, this, this.currPlAtTurn);

                this.currPlAtTurn.savedTime--

            } else if (this.turnTimer == 0 && this.currPlAtTurn.savedTime <= 0) {
                LogMessage(`Player ${this.currPlAtTurn.playerID} decreasing extra timer.`, this, this.currPlAtTurn);

                this.extraTimer--;
            } else {

                LogMessage(`Player ${this.currPlAtTurn.playerID} decreasing turn timer.`, this, this.currPlAtTurn);
                this.turnTimer--;
            }

        } else {

            LogMessage(`Player ${this.currPlAtTurn.playerID}  resetting turn timer & extra timer`, this, this.currPlAtTurn);
            this.turnTimer = 0
            this.extraTimer = 0;
        }

        let timerMsg = {
            t: MSGTYPE.TIMER,
            data: this.turnTimer,
            extraTime: this.currPlAtTurn.savedTime,
            currPlTurn: this.currPlAtTurn.plRoomNetId
        }
        this.sendMessageToAll(timerMsg)


        if ((this.currPlAtTurn.playerState == PLAYERSTATE.LEFT || (this.turnTimer == 0 && this.currPlAtTurn.savedTime == 0)) && this.canDiscardCard) {
            LogMessage(`Player ${this.currPlAtTurn.playerID}  Discarding Card`, this, this.currPlAtTurn);

            if (this.currPlAtTurn.lastPickedCard != undefined) {
                LogMessage(`Player ${this.currPlAtTurn.playerID}  Discarding last picked card`, this, this.currPlAtTurn);
                this.canDiscardCard = false;
                this.currPlAtTurn.sendMessage({ t: "canDiscard", data: false });
            }
        }


        if (this.currPlAtTurn.playerState == PLAYERSTATE.LEFT || (this.turnTimer == 0 && this.currPlAtTurn.savedTime == 0 && this.extraTimer == 0)) {


            LogMessage(`Player ${this.currPlAtTurn.playerID}  skipping turn`, this, this.currPlAtTurn);

            let playerSkippingTurn = this.currPlAtTurn.plRoomNetId

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
                }

                this.currPlAtTurn.sendMessage(discardedCardInfo);

                LogMessage(this.currPlAtTurn.plRoomNetId + " - Auto Card Discarded : " + this.currPlAtTurn.lastPickedCard.name, this, this.currPlAtTurn);
            }


            console.log("Calling next player turn from turn timer loop : " + this.currentGameRoundReport);
            this.getNextPlayerForTurn()


            let turnSkipMsg: any = {
                t: MSGTYPE.TURNSKIPPED,
                plId: playerSkippingTurn,
                nextRoll: this.currPlAtTurn.plRoomNetId,

            }

            if (this.PlayersUniqIdDict[playerSkippingTurn]) {
                turnSkipMsg.lives = this.PlayersUniqIdDict[playerSkippingTurn].skippedTurns;

                if (this.PlayersUniqIdDict[playerSkippingTurn].lastPickedCard != undefined) {
                    turnSkipMsg.openCard = this.PlayersUniqIdDict[playerSkippingTurn].lastPickedCard.name;
                    this.PlayersUniqIdDict[playerSkippingTurn].lastPickedCard = undefined;
                }

            } else if (this.PermaLeftPlayerUniqIdDict[playerSkippingTurn]) {

                turnSkipMsg.lives = this.PermaLeftPlayerUniqIdDict[playerSkippingTurn].skippedTurns;


                if (this.PermaLeftPlayerUniqIdDict[playerSkippingTurn].lastPickedCard != undefined) {
                    turnSkipMsg.openCard = this.PermaLeftPlayerUniqIdDict[playerSkippingTurn].lastPickedCard.name;
                    this.PermaLeftPlayerUniqIdDict[playerSkippingTurn].lastPickedCard = undefined;
                }
            } else {
                sendToAnalytics({
                    collection: DBCollectionNames.UnexpectedErrors,
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



            this.sendMessageToAll(turnSkipMsg)

            clearTimeout(this.turnTimeout)
            this.turnTimer = this.turnTimeVal;
            this.extraTimer = this.extraTimeVal;
            this.turnTimeout = setTimeout(this.turnTimerLoop.bind(this), 1000)


            if (this.PlayersUniqIdDict[playerSkippingTurn] && this.PlayersUniqIdDict[playerSkippingTurn].skippedTurns >= 3) {


                const pl = this.PlayersUniqIdDict[playerSkippingTurn];

                const kickReq: KickRequest = {
                    removeEvent: RemovePlayerEvent.TIMEOUT,
                    callBack: undefined
                };

                pl.infoLog(`Three Skips Kicked`);

                const removeReq = new RemoveRequest(pl, LeaveState.KICKED, kickReq);

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

        } else {

            LogMessage(`Player ${this.currPlAtTurn.playerID}  calling setTimeout for TurnTimerLoop`, this, this.currPlAtTurn);
            this.turnTimeout = setTimeout(this.turnTimerLoop.bind(this), 1000)
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

    get activePlayersCount(): number {
        let count = 0;

        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] && this.PlayersUniqIdDict[i].playerState == PLAYERSTATE.INGAME)
                count++
        }

        return count;
    }


    waitTimerLoop() {


        this.waitTimer--;
        //   console.log("Running Wait Timer Loop ==== " + this.waitTimer)
        //   console.log("Running Wait Timer Loop ==== " + this.waitTimeout)

        let waitTimerMsg = {
            t: MSGTYPE.WAITTIMER,
            data: this.waitTimer,
        }
        this.sendMessageToAll(waitTimerMsg)


        if (this.waitTimer == 0) {
            console.log(this.activePlayersCount);
            LogMessage("Current Players  :" + this.currentPlayersCount, this);

            if (this.currentPlayersCount >= this.minPlayers) {
                clearTimeout(this.waitTimeout)
                this.startTheGame()
            } else {
                this.waitTimer = this.waitTimerVal;
                this.waitTimeout = setTimeout(this.waitTimerLoop.bind(this), 1000)
            }
        } else {
            this.waitTimeout = setTimeout(this.waitTimerLoop.bind(this), 1000)
        }
    }


    getNextPlayerForTurn() {
        console.log("getting next player")
        let nextPlayer = null;
        let currPlId = this.currPlAtTurn != null ? this.currPlAtTurn.plRoomNetId : 0
        let loopCount = 0;
        while (nextPlayer == null || nextPlayer == undefined) {
            console.log("while loop 1 " + this.currentGameRoundId)

            if (this.gameStateHandler.GetState != GAMESTATE.IN_GAME && this.gameStateHandler.GetState != GAMESTATE.TOSS) {
                LogMessage("Game is not in ingame state stopping While Loop 1", this);
                LogMessage('Current Player  : ' + this.currPlAtTurn?.playerID, this);
                return null;
            }


            if (loopCount > 10) {
                console.log(this.currPlAtTurn.playerID);
                console.log("---------------------");
                for (let i = 0; i < this.maxPlayers; i++) {
                    console.log(i);
                    if (this.PlayersUniqIdDict[i])
                        console.log(this.PlayersUniqIdDict[i].playerID + " : " + PLAYERSTATE[this.PlayersUniqIdDict[i].playerState]);
                }
                console.log("---------------------");
            }

            if (this.currentPlayersCount <= 1) {
                return null;
            }


            currPlId++
            if (currPlId >= this.maxPlayers) {
                currPlId = 0
            }

            if (this.PlayersUniqIdDict[currPlId] && !this.PlayersUniqIdDict[currPlId].isBlacklisted)
                nextPlayer = this.PlayersUniqIdDict[currPlId]

            loopCount++;
        }
        this.currPlAtTurn = nextPlayer;
        // console.log(this.currPlAtTurn.plRoomNetId + " : Next Player Selected!");
        LogMessage(this.currPlAtTurn.playerID + " : Next Player Selected!", this, this.currPlAtTurn);
        this.currPlAtTurn.noOfTurns++;
        return currPlId;
    }


    getWhoseWillBeNextTurn() {
        console.log("getting next player")
        let nextPlayer = null;
        let currPlId = this.currPlAtTurn != null ? this.currPlAtTurn.plRoomNetId : 0
        while (nextPlayer == null || nextPlayer == undefined) {
            console.log("while loop 1")

            if (this.currentPlayersCount <= 1) {
                return null;
            }


            currPlId++
            if (currPlId >= this.maxPlayers) {
                currPlId = 0
            }

            if (this.PlayersUniqIdDict[currPlId] && !this.PlayersUniqIdDict[currPlId].isBlacklisted)
                nextPlayer = this.PlayersUniqIdDict[currPlId]

        }
        this.currPlAtTurn = nextPlayer;
        this.currPlAtTurn.noOfTurns++;
        return currPlId;
    }

    async handleDeclare(pl: Player, cards: string[][]) {

        if (this.gameStateHandler.GetState != GAMESTATE.FINISHING) {
            LogMessage(`Player : ${pl.playerID} tried to declare but game is not in ingame state`, this, pl);
            console.log("Can't Decalre, Game is not in ingame state for " + pl.plRoomNetId);
            return;
        }

        if (pl.finalTurnTimeout)
            clearTimeout(pl.finalTurnTimeout)
        else {
            LogMessage(`Player : ${pl.playerID} tried to declare but final turn timeout didn't started`, this, pl);
            console.log("Can't Decalre, Final Turn Timeout didn't started for " + pl.plRoomNetId);

            return;
        }

        pl.finalTurnTimeout = null;

        LogMessage("Player " + pl.plRoomNetId + " Declared with cards " + JSON.stringify(cards), this, pl);
        pl.infoLog(`Declare Cards`, { cards: JSON.stringify(cards) });


        pl.updateDeckFormation(cards);
        // pl.finalCardsFormation = cards;


        let isValidDeclare = true;
        let Sets: string[][] = [];
        let PureSeqs: string[][] = [];
        let ImpureSeqs: string[][] = []

        LogMessage("Cards : " + JSON.stringify(cards), this, pl);
        console.log("Cards : " + JSON.stringify(cards));

        for (let i = 0; i < cards.length; i++) {
            let setseq: string[] = cards[i];

            //Check if there is atleast one pure sequence

            //check if there is one more sequence



            let isSet = isValidSet(setseq, this.jokerCard.val)
            let ispureSeq = isValidPureSequence(setseq)

            let isImpureSeq = isValidImpureSequence(setseq, this.jokerCard.val)

            if (ispureSeq)
                PureSeqs.push(setseq)
            else if (isImpureSeq)
                ImpureSeqs.push(setseq)
            else if (isSet)
                Sets.push(setseq)
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
                isValidDeclare = true
            } else {
                isValidDeclare = false
            }
        }

        //to change
        // isValidDeclare = true;

        if (!isValidDeclare) {

            pl.lostPoints = 80;
            pl.result = "lost";

            pl.infoLog(`Invalid Declare`, { cards: JSON.stringify(cards) });

            this.declarePlId = -1;

            if (pl.playerState == PLAYERSTATE.LEFT)
                pl.result = "Invalid Declare";
            else
                pl.playerState = PLAYERSTATE.DROPPED;

            console.log("Player state On Invalid Declare  :" + pl.playerState + "      " + this.gameStateHandler.GetState);

            await this.handleChargePlayer(pl, pl.lostPoints * this.pointsVal, "invalid declare");

            // this.potDistribution += pl.lostPoints;


            let invDeclMsg = { t: "invalidDeclare", plid: pl.plRoomNetId, lostPoints: pl.lostPoints, amt: -Math.trunc(pl.lostPoints * this.pointsVal * 100) / 100, cards: pl.cardFormationString }
            this.sendMessageToAll(invDeclMsg)


            // this.removePlayerFromRoom(pl);

            //if alone player left then make last player winner
            if (this.activePlayersCount == 1) {
                this.endRummyGame({}, GAMEENDCONDITION.OPPONENTINVALIDDECLARE);
            } else if (this.activePlayersCount > 1) {
                this.gameStateHandler.SetState(GAMESTATE.IN_GAME);
                console.log("Calling Next Turn from Invalid Declare : " + this.currentGameRoundId);
                let nextPlayerTurnMsg = {
                    t: "nextPlayerTurnMsg",
                    plId: this.getNextPlayerForTurn(),
                    openDeck: this.OpenDeck[this.OpenDeck.length - 1].name
                }
                // this.gameState = GAMESTATE.INGAME;


                this.sendMessageToAll(nextPlayerTurnMsg)
                this.turnTimer = this.turnTimeVal;
                this.extraTimer = this.extraTimeVal;
                this.turnTimeout = setTimeout(this.turnTimerLoop.bind(this), 1000)
            } else {
                sendToAnalytics({
                    collection: DBCollectionNames.UnexpectedErrors,
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




        } else {
            pl.lostPoints = 0;
            pl.result = "win";
            this.winner = pl.plRoomNetId;
            let DeclMsg: any = { t: "validDeclare", plid: pl.plRoomNetId, amt: Math.trunc(pl.lostPoints * this.pointsVal * 100) / 100, cards: pl.cardFormationString }
            // this.gameState = GAMESTATE.SUBMITING;

            pl.infoLog(`Valid Declare`, { cards: JSON.stringify(cards) });

            this.gameStateHandler.SetState(GAMESTATE.SUBMITING);

            for (let i = 0; i < this.maxPlayers; i++) {
                if (this.PlayersUniqIdDict[i] != null && this.PlayersUniqIdDict[i] != undefined) {


                    if (this.PlayersUniqIdDict[i] != pl && !this.PlayersUniqIdDict[i].isBlacklisted) {
                        DeclMsg.timer = this.PlayersUniqIdDict[i].savedTime + 30;


                        this.PlayersUniqIdDict[i].finalTurnTimeout = setTimeout(() => {
                            if (this.PlayersUniqIdDict[i].hasSubmitted) {
                                console.log("all is good");
                            } else {
                                LogMessage("Player " + this.PlayersUniqIdDict[i].plRoomNetId + " didn't submit in time", this, this.PlayersUniqIdDict[i]);
                                this.handleSubmit(this.PlayersUniqIdDict[i], this.PlayersUniqIdDict[i].cardFormationString);
                            }
                        }, (this.PlayersUniqIdDict[i].savedTime + 32) * 1000);

                        this.PlayersUniqIdDict[i].finalTurnTimeoutKeeper = new TimeoutKeeper((this.PlayersUniqIdDict[i].savedTime + 32) * 1000, this.PlayersUniqIdDict[i].finalTurnTimeout);

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

    }


    async handleSubmit(pl: Player, cards: any[]) {

        if (this.gameStateHandler.GetState != GAMESTATE.SUBMITING) {
            LogMessage(`Player ${pl.playerID} submitted in wrong state`, this, pl);
            return;
        }

        if (pl.finalTurnTimeout)
            clearTimeout(pl.finalTurnTimeout)
        else {
            console.log("Can't Submit, Final Turn Timeout didn't started for " + pl.plRoomNetId);

            return;
        }

        LogMessage(`Player ${pl.plRoomNetId} submitted cards ${JSON.stringify(cards)}`, this, pl);
        pl.infoLog(`Submitted Cards`, { cards: JSON.stringify(cards) });

        pl.finalTurnTimeout = null;
        console.log("Submit Cards")
        console.log(cards)

        let lostPoints = 0
        let Sets = [];
        let PureSeqs = [];
        let ImpureSeqs = []



        //checking for pure seqs
        for (let i = 0; i < cards.length; i++) {
            let setseq: string[] = cards[i];
            let ispureSeq = isValidPureSequence(setseq)

            let isImpureSeq = isValidImpureSequence(setseq, this.jokerCard.val)

            if (ispureSeq)
                PureSeqs.push(setseq);
            else if (isImpureSeq) {
                ImpureSeqs.push(setseq)
            }
        }

        for (let i = 0; i < cards.length; i++) {
            let setseq: string[] = cards[i];

            //Check if there is atleast one pure sequence

            //check if there is one more sequence


            let isSet = isValidSet(setseq, this.jokerCard.val)
            let ispureSeq = isValidPureSequence(setseq)

            let isImpureSeq = isValidImpureSequence(setseq, this.jokerCard.val)

            let hasToAdd = false;

            if (ispureSeq) {

            }
            else if (isImpureSeq) {
                if (PureSeqs.length == 0 || PureSeqs.length + ImpureSeqs.length <= 1)
                    hasToAdd = true;
            }
            else if (isSet) {
                Sets.push(setseq)

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
                        let cardVal = parseInt(setseq[j].split('-')[0])
                        let cardType = parseInt(setseq[j].split('-')[1])

                        if (cardVal == 1 || cardVal == 11 || cardVal == 12 || cardVal == 13)
                            lostPoints += 10
                        else
                            lostPoints += cardVal;


                        if (isNaN(lostPoints))
                            sendToAnalytics({
                                collection: DBCollectionNames.UnexpectedErrors,
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
            await this.handleChargePlayer(pl, pl.lostPoints * this.pointsVal, "Lost points");
            pl.readyForResultCalculation = true;
        }


        LogMessage(`Player ${pl.playerID} lost ${pl.lostPoints} points`, this, pl);
        LogMessage(`isBlaclisted : ${pl.isBlacklisted} && isDisconnected : ${pl.isDisconnected}`, this, pl);
        this.checkIsResultReady(pl.playerID);

    }


    checkIsResultReady(playerId: string) {

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

        LogMessage(`All players submitted their cards ${playerId}`, this);
        this.handleResult("valid declare");
        //TODO ADD AWAIT HERE.
    }

    async handleResult(reason: string) {

        LogMessage(`Game ${this.currentGameRoundId} result is calculating, reason=${reason}`, this);
        this.currentGameRoundReport.reason = reason;

        // this.gameState = GAMESTATE.RESULT;
        this.gameStateHandler.SetState(GAMESTATE.RESULT);

        let result = []
        let resultData: Result = {};

        LogGameStateToDB(LogGameStates.RESULT_CALCULATED, this);
        // this.isGameEnded = true;

        //Charging disconnected players if they are not charged
        for (let i = 0; i < this.maxPlayers; i++) {

            if (this.PlayersUniqIdDict[i] && this.PlayersUniqIdDict[i].isDisconnected && !this.PlayersUniqIdDict[i].isBlacklisted) {
                let pl = this.PlayersUniqIdDict[i];

                if (!pl.isCharged && pl.result != "win") {
                    pl.lostPoints = 80

                    // deduct balance from player
                    await this.handleChargePlayer(pl, pl.lostPoints * this.pointsVal, "Lost points");
                }
            }
        }


        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] !== null && this.PlayersUniqIdDict[i] != undefined && this.PlayersUniqIdDict[i].playerState != PLAYERSTATE.WAITING) {

                const playerId = this.PlayersUniqIdDict[i].playerID;

                const resultLine: any = {
                    name: this.PlayersUniqIdDict[i].plName,
                    plId: this.PlayersUniqIdDict[i].plRoomNetId,
                    result: this.PlayersUniqIdDict[i].result,
                    points: this.PlayersUniqIdDict[i].lostPoints,
                    amount: -Math.trunc(this.PlayersUniqIdDict[i].lostPoints * this.pointsVal * 100) / 100,
                    cards: this.PlayersUniqIdDict[i].cardFormationString
                }



                let rake;
                if (this.PlayersUniqIdDict[i].result == "win") {

                    rake = await this.handleRewardPlayer(this.PlayersUniqIdDict[i], this.potDistribution, reason);

                    try {
                        //Removed RoundUp as for now trunc and round is same
                        resultLine.amount = Math.trunc((this.PlayersUniqIdDict[i].reward * 100)) / 100;
                        // resultLine.amount = this.PlayersUniqIdDict[i].reward;//Math.trunc(this.PlayersUniqIdDict[i].reward * 100) / 100;
                    } catch (e) {
                        sendToAnalytics({
                            collection: DBCollectionNames.UnexpectedErrors,
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
                }

                result.push(resultLine)
            }
        }





        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PermaLeftPlayerUniqIdDict[i] !== null && this.PermaLeftPlayerUniqIdDict[i] != undefined && this.PermaLeftPlayerUniqIdDict[i].playerState != PLAYERSTATE.WAITING) {
                const resultLine: any = {
                    name: this.PermaLeftPlayerUniqIdDict[i].plName,
                    plId: this.PermaLeftPlayerUniqIdDict[i].plRoomNetId,
                    result: this.PermaLeftPlayerUniqIdDict[i].result,
                    points: this.PermaLeftPlayerUniqIdDict[i].lostPoints,
                    amount: -Math.trunc(this.PermaLeftPlayerUniqIdDict[i].lostPoints * this.pointsVal * 100) / 100,
                    cards: this.PermaLeftPlayerUniqIdDict[i].cardFormationString
                }


                let rake;
                if (this.PermaLeftPlayerUniqIdDict[i].result == "win") {

                    rake = await this.handleRewardPlayer(this.PermaLeftPlayerUniqIdDict[i], this.potDistribution, "valid declare");



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

                result.push(resultLine)
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
        LogMessage("Removing Disconnect players from the game", this);

        this.kickInactivePlayers();

        let keys = Object.keys(this.PermaLeftPlayerUniqIdDict);
        //Remove Winner from Permanent Left Players from the game
        LogMessage("Perma Left Players : " + keys.length, this);
        for (let i = 0; i < keys.length; i++) {
            LogMessage("Looping Kicking Perma Player  : " + keys[i], this);

            const player = this.PermaLeftPlayerUniqIdDict[keys[i]];
            if (player && player.result == "win") {
                LogMessage("Kicking Perma Player : " + keys[i], this);

                const kickReq: KickRequest = {
                    removeEvent: RemovePlayerEvent.KICKED,
                    callBack: undefined
                };

                const removeReq = new RemoveRequest(player, LeaveState.KICKED, kickReq);
                this.removeRequestHandler.AddRequest(removeReq);
            }
        }

        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] && this.PlayersUniqIdDict[i].playerState == PLAYERSTATE.WAITING) {
                this.currentGameRoundReport.waitingPlayers.push(this.PlayersUniqIdDict[i].playerID);
            }
        }

        LogGameStateToDB(LogGameStates.GAME_END, this);


        CallGameRoundReportAPI(this.tableGameId, this.currentGameRoundId, undefined, false, this.currentGameRoundReport);

        this.calculatedResult = result;


        if (this.currentPlayersCount <= 0) {

            //This means that restart call is not going to be called from MasterServer




            this.deleteTableTimeout = setTimeout(() => {

                LogMessage("Deleting Table", this);

                this.closeTableImmediate("Current Player Count is : " + this.currentPlayersCount, false)
            }, 5000);

        }
    }

    kickInactivePlayers() {
        LogMessage("Removing Disconnect players from the game", this);
        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i]) {
                if (this.PlayersUniqIdDict[i].isDisconnected) {
                    const kickReq: KickRequest = {
                        removeEvent: RemovePlayerEvent.KICKED,
                        callBack: undefined
                    };
                    LogMessage("Removing Disconnect player : " + this.PlayersUniqIdDict[i].playerID, this);


                    const removeReq = new RemoveRequest(this.PlayersUniqIdDict[i], LeaveState.KICKED, kickReq);
                    this.removeRequestHandler.AddRequest(removeReq);
                }
                // this.kickInactivePlayer(this.PlayersUniqIdDict[i]);
            }
        }
        LogMessage("Current Players : " + this.currentPlayersCount, this);

    }


    // kickInactivePlayer(pl : Player)
    // {
    //     LogMessage(`Kicking player ${pl.playerID} from table ${this.tableGameId}`, this, pl);

    //     CallLeftPlayerAPI(this.tableGameId, pl.playerID, RemovePlayerEvent.KICKED);

    //     delete this.PlayersUniqIdDict[pl.plRoomNetId];

    //     this.currentPlayersCount--;
    // }


    // kickIneligiblePlayersAndRestart(playerStatus: any) {
    //     const keys = Object.keys(playerStatus);

    //     LogMessage("Kicking Ineligible Players " + keys.length, this);


    //     for (let i = 0; i < this.maxPlayers; i++) {
    //         if (!this.PlayersUniqIdDict[i])
    //             continue;

    //         const player = this.PlayersUniqIdDict[i];

    //         if (!playerStatus[player.playerID]) {
    //             const errorReq: ErrorRequest = {
    //                 msg: "Insufficient Balance",
    //                 code: ErrorCode.INSUFFICIENT_BALANCE
    //             };

    //             LogMessage("Kicking Ineligible Player " + player.playerID, this);

    //             const removeReq = new RemoveRequest(player, LeaveState.ERROR, errorReq);
    //             this.removeRequestHandler.AddRequest(removeReq);
    //         }
    //     }

    //     // for(let i = 0; i < keys.length; i++)
    //     // {
    //     //     if(!playerStatus[keys[i]])
    //     //     {
    //     //         const plId = this.getSeatIdFromPlayerId(keys[i]);
    //     //         if(plId != "-1")
    //     //         {
    //     //             const pl = this.PlayersUniqIdDict[plId];

    //     //             if(pl == undefined || pl == null)
    //     //                 continue;

    //     //             const errorReq : ErrorRequest = {
    //     //                 msg : "Insufficient Balance",
    //     //                 code : ErrorCode.INSUFFICIENT_BALANCE
    //     //             };

    //     //             const removeReq = new RemoveRequest(pl, LeaveState.ERROR, errorReq);

    //     //             this.removeRequestHandler.AddRequest(removeReq);

    //     //             // if(pl)
    //     //             // {
    //     //             //     this.sendErrorToPlayer(pl,
    //     //             //         ErrorMessage.InsufficientBalance, undefined, {
    //     //             //         reason : RemovePlayerEvent.ERRORED
    //     //             //     });
    //     //             // }
    //     //         }
    //     //     }
    //     // }

    //     this.kickInactivePlayers();

    //     // //Kicking disconnected players from the table
    //     // for (let i = 0; i < this.maxPlayers; i++)
    //     // {
    //     //     if (this.PlayersUniqIdDict[i])
    //     //     {
    //     //         if(this.PlayersUniqIdDict[i].isDisconnected)
    //     //         {
    //     //             const kickReq : KickRequest = {
    //     //                 removeEvent : RemovePlayerEvent.KICKED,
    //     //                 callBack : undefined
    //     //             };

    //     //             const removeReq = new RemoveRequest(this.PlayersUniqIdDict[i], LeaveState.KICKED, kickReq);
    //     //             this.removeRequestHandler.AddRequest(removeReq);
    //     //         }
    //     //             // this.kickInactivePlayer(this.PlayersUniqIdDict[i]);
    //     //     }
    //     // }



    //     if (this.currentPlayersCount <= 0) {

    //         this.deleteTableTimeout = setTimeout(() => {
    //             console.log("closing the table")

    //             this.closeTableImmediate("Current Player Count is : " + this.currentPlayersCount, false)
    //         }, 5000);

    //     } else {

    //         // this.gameState = GAMESTATE.RESTARTING;
    //         this.gameStateHandler.SetState(GAMESTATE.RESTARTING);

    //         if (this.stopRestart) {
    //             console.log("Table Game restarting stop : " + this.tableGameId);
    //             LogMessage("Table Game restarting stop : " + this.tableGameId, this);
    //         } else {
    //             LogMessage("Restarting Table Game : " + this.tableGameId, this);
    //             this.isWaitingForRestart = true;
    //             this.restartTimeout = setTimeout(() => {
    //                 this.restartGame();
    //             }, 5000);
    //         }
    //     }
    // }

    getSeatIdFromPlayerId(playerId: string): string {
        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] && this.PlayersUniqIdDict[i].playerID == playerId) {
                return i.toString();
            }
        }

        return (-1).toString();
    }



    handleCardsCheck(pl: Player, cards: any[]) {
        let isSet = isValidSet(cards, this.jokerCard.val)
        let ispureSeq = isValidPureSequence(cards)
        let isImpureSeq = isValidImpureSequence(cards, this.jokerCard.val)


        let checkMsg = {

            t: "cardSeqCheckMsg",
            isSet: isSet,
            isPureSeq: ispureSeq,
            isImpureSeq: isImpureSeq,
            cards: cards

        }

        pl.sendMessage(checkMsg);
    }




    sortCards(cards: string[]) {

        for (var i = 0; i < cards.length; i++) {
            for (var j = 0; j < cards.length; j++) {
                let cardVali = parseInt(cards[i].split('-')[0])
                let cardValj = parseInt(cards[j].split('-')[0])

                if (cardVali < cardValj) {
                    var temp = cards[i];
                    cards[i] = cards[j];
                    cards[j] = temp;
                }
            }
        }

        return cards
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
            this.ClosedDeck.push(new Card(i, SUIT.S))
        }
        for (let i = 1; i <= 13; i++) {
            this.ClosedDeck.push(new Card(i, SUIT.C))
        }
        for (let i = 1; i <= 13; i++) {
            this.ClosedDeck.push(new Card(i, SUIT.D))
        }
        for (let i = 1; i <= 13; i++) {
            this.ClosedDeck.push(new Card(i, SUIT.H))
        }
        for (let i = 1; i <= 13; i++) {
            this.ClosedDeck.push(new Card(i, SUIT.S))
        }
        for (let i = 1; i <= 13; i++) {
            this.ClosedDeck.push(new Card(i, SUIT.C))
        }
        for (let i = 1; i <= 13; i++) {
            this.ClosedDeck.push(new Card(i, SUIT.D))
        }
        for (let i = 1; i <= 13; i++) {
            this.ClosedDeck.push(new Card(i, SUIT.H))
        }
        this.ClosedDeck.push(new Card(0, SUIT.JOKER))
        this.ClosedDeck.push(new Card(0, SUIT.JOKER))

        //Shuffle Deck
        this.shuffle(this.ClosedDeck)
        //console.log(this.ClosedDeck)
    }


    restartGame() {
        if (this.turnTimeout) {
            LogMessage("Clearing Turn Timeout", this);
            clearTimeout(this.turnTimeout);
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
        this.OpenDeck = []
        // @ts-ignore: Unreachable code error
        this.jokerCard = null;
        this.potDistribution = 0
        this.restartTimeout = undefined;
        this.winner = -1;
        this.isWaitingForRestart = false;

        this.declarePlId = -1; // reseting declarePlid for next game
        // this.gameState = GAMESTATE.MATCHMAKING;

        this.gameStateHandler.SetState(GAMESTATE.MATCHMAKING);

        this.createShuffledCardDeck();

        this.waitTimer = this.waitTimerVal;
        this.turnTimer = this.turnTimeVal
        this.waitTimeout = setTimeout(this.waitTimerLoop.bind(this), 1000)

        this.PermaLeftPlayerUniqIdDict = {};
        for (let i = 0; i < this.maxPlayers; i++) {
            if (this.PlayersUniqIdDict[i] && this.PlayersUniqIdDict[i] != undefined) {


                this.PlayersUniqIdDict[i].score = 0;
                this.PlayersUniqIdDict[i].skippedTurns = 0;
                this.PlayersUniqIdDict[i].savedTime = 90;
                this.PlayersUniqIdDict[i].lostPoints = 0
                this.PlayersUniqIdDict[i].hasSubmitted = false


                this.PlayersUniqIdDict[i].restartReset();

                // this.PlayersUniqIdDict[i].finalCardsFormation = [];
                this.PlayersUniqIdDict[i].isCharged = false;
                this.PlayersUniqIdDict[i].playerState = PLAYERSTATE.INGAME;
                this.PlayersUniqIdDict[i].result = undefined;
                this.PlayersUniqIdDict[i].reward = 0;
                this.PlayersUniqIdDict[i].lastPickedCard = undefined;
                this.PlayersUniqIdDict[i].readyForResultCalculation = false;



                this.PlayersUniqIdDict[i].noOfTurns = 0;

                if (this.PlayersUniqIdDict[i].finalTurnTimeout) {
                    // @ts-ignore: Unreachable code error
                    clearTimeout(this.PlayersUniqIdDict[i].finalTurnTimeout);

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
                LogMessage("Closing the table", this);
                this.closeTableImmediate(`Current Player Count is ${this.currentPlayersCount}`, false)
            }, 5000);
        }
    }



    // getFirstPlayerId() {

    //     for (let i = 0; i < this.maxPlayers; i++)
    //         if (this.PlayersUniqIdDict[i] != null)
    //             return i;

    //     return -1;
    // }


    potDistribution: number = 0;
}

function CallCreditBalanceAPI(arg0: string, playerID: string, tableGameId: string, currentGameRoundId: string, WIN: TxReasons) {
    throw new Error("Function not implemented.");
}
