

import { CallLeftPlayerAPI, DBCollectionNames, sendToAnalytics } from "../../apicalls";
import { ErrorRequest, KickRequest, LeaveState } from "../../DataTypes";
import { LogMessage } from "../LoggingHandler";
import { Player } from "../Player";
import { TableGameRoom } from "../TableGameRoom";
import { ErrorCode, GAMESTATE, MSGTYPE, PLAYERSTATE, RemovePlayerEvent } from "../Utils";
import { GameState } from "./GameState";


export class InGameState extends GameState
{ 

    constructor(table : TableGameRoom)
    {
        super(table, GAMESTATE.IN_GAME);
    }


    public OnStateEnter(): void {
        // throw new Error("Method not implemented.");
    }
    public OnStateExit(): void {
        // throw new Error("Method not implemented.");
    }
    public OnPlayerJoin(player: Player): void {
        // throw new Error("Method not implemented.");
    }


    public override async OnLeaveClicked(player: Player): Promise<void> {
        super.OnLeaveClicked(player);
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

        if(oldState == PLAYERSTATE.INGAME && !player.isCharged)
        {
            player.result = "left";
            player.lostPoints = 80;
            this.table.addToPermaLeft(player);
            await this.table.handleChargePlayer(player, 80 * this.table.pointsVal, "Player Left Game");
            CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.LEFT);
            player.readyForResultCalculation = true;
        } else 
        {

            if(oldState == PLAYERSTATE.DROPPED)
            {
                this.table.addToPermaLeft(player);   
            }

            CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.LEFT);
        }

        this.CloseSocket(player);
    }

    public override async OnWsDisconnect(player: Player): Promise<void> {
        super.OnWsDisconnect(player);
       
        // if player is in waiting state
            //perform leave actions
            //call player left API
            //return

        if(player.playerState == PLAYERSTATE.WAITING)
        {
            this.BasicLeftOperations(player);

            CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.LEFT);
            return;
        }


        //Treat as disconnect
        //Mark as disconnected
        player.isDisconnected = true;
        //Perform disconnect actions
        this.table.sendMessageToAll({
            t : MSGTYPE.PLEFT,
            data : player.plRoomNetId,
            state : player.playerState
        });

        //call player left API
        CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.DISCONNECTED);
    }
    
    public override async Kick(player: Player, kickReq: KickRequest): Promise<void> {
        super.Kick(player, kickReq);
        
        if(!player.isDisconnected)
        {
            this.table.sendMessageToAll({
                t : MSGTYPE.PLEFT,
                data : player.plRoomNetId,
                state : player.playerState
            });
        }

        this.BasicLeftOperations(player);
        
        player.lostPoints = 80;
        player.result = "lost";

        this.table.addToPermaLeft(player);

        await this.table.handleChargePlayer(player, 80 * this.table.pointsVal, "Three Skips Kicked");

        CallLeftPlayerAPI(this.table.tableGameId, player.playerID, kickReq.removeEvent);

        sendToAnalytics({
            collection : DBCollectionNames.GAME_EVENTS,
            data : {
                type : "ThreeSkipsKicked",
                playerId : player.playerID,
                tableGameId : this.table.tableGameId,
                gameRoundId : this.table.currentGameRoundId,
                time : new Date()
            }
        });

        let plKillMsg = {
            t : MSGTYPE.THREESKIPS,
            plId : player.plRoomNetId
        };

        player.sendMessage(plKillMsg);

        this.CloseSocket(player);
    }

    public override async Errored(player: Player, errorData: ErrorRequest): Promise<void> {
        super.Errored(player, errorData);
        
        player.playerState = PLAYERSTATE.LEFT;
        this.UnableToJoinError(player, errorData);

    }
}