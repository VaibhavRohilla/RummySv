import { CallLeftPlayerAPI } from "../../apicalls";
import { ErrorRequest, KickRequest } from "../../DataTypes";
import { LogMessage } from "../LoggingHandler";
import { Player } from "../Player";
import { TableGameRoom } from "../TableGameRoom";
import { GAMESTATE, MSGTYPE, PLAYERSTATE, RemovePlayerEvent } from "../Utils";
import { GameState } from "./GameState";



export class SubmitingState extends GameState
{

    constructor(table : TableGameRoom)
    {
        super(table, GAMESTATE.SUBMITING);
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

        const oldState = player.playerState;

        this.BasicLeftOperations(player);

    
        //check if old state was ingame
            //check if player has submitted
                //check if player is winner
                    //if yes, Don't Kick him yet
                //else
                    //Call Player Left API
            //else
                //end final turn timeout
                //declare cards
                //Call Player Left API
        //else
            //Call Player Left API
            LogMessage("Submitting Player State : " + oldState,this.table);
            LogMessage("has Player Submitted ?  : " + player.hasSubmitted,this.table);

        
        if(oldState == PLAYERSTATE.INGAME)
        {
            if(player.hasSubmitted)
            {
                if(player.result == "win")
                {
                    //Don't kick him yet
                    this.table.addToPermaLeft(player);
                } else
                {
                    this.table.addToPermaLeft(player);

                    CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.LEFT);
                }
            } else
            {
                if(player.finalTurnTimeout != null)
                    clearTimeout(player.finalTurnTimeout);
               
                player.result = "left";
                player.lostPoints = 80;
                this.table.addToPermaLeft(player);

                await this.table.handleChargePlayer(player, 80 * this.table.pointsVal, "Player Left Game");
                CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.LEFT);
                player.readyForResultCalculation = true;

                this.table.checkIsResultReady(player.playerID);
            }
        } else
        {
            if(oldState == PLAYERSTATE.DROPPED)
                this.table.addToPermaLeft(player);

            CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.LEFT);
        }

        //close socket
        this.CloseSocket(player);
    }

    public override async OnWsDisconnect(player: Player): Promise<void> {
        super.OnWsDisconnect(player);

        if(player.playerState == PLAYERSTATE.WAITING)
        {
            this.BasicLeftOperations(player);

            CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.LEFT);
            return;
        }

        player.isDisconnected = true;

        this.table.sendMessageToAll({
            t  : MSGTYPE.PLEFT,
            data : player.plRoomNetId,
            state : player.playerState
        });

        CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.DISCONNECTED);
    }

    public override async Kick(player: Player, kickReq: KickRequest): Promise<void> {
        super.Kick(player, kickReq);

        // throw new Error("Method not implemented.");
    }

    public override async Errored(player: Player, errorData: ErrorRequest): Promise<void> {
       super.Errored(player, errorData); 

       player.playerState = PLAYERSTATE.LEFT;

       this.UnableToJoinError(player, errorData);
    }


}