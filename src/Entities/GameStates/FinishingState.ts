import { CallLeftPlayerAPI } from "../../apicalls";
import { ErrorRequest, KickRequest } from "../../DataTypes";
import { LogMessage } from "../LoggingHandler";
import { Player } from "../Player";
import { TableGameRoom } from "../TableGameRoom";
import { GAMESTATE, MSGTYPE, PLAYERSTATE, RemovePlayerEvent } from "../Utils";
import { GameState } from "./GameState";



export class FinishingState extends GameState
{
    

    constructor(table : TableGameRoom)
    {
        super(table, GAMESTATE.FINISHING);
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
       
        if(player.plRoomNetId == this.table.declarePlId)
        {
            LogMessage('has Player Submitted On Finish State : '+player.hasSubmitted, this.table);

            // if( PLAYERSTATE.LEFT == player.playerState)
            // {
            //     this.table.addToPermaLeft(player);
            // await this.table.handleDeclare(player, player.cardFormationString);
            // }
            if(player.hasSubmitted)
            {
                //Don't kick him yet because he is winner
                this.table.addToPermaLeft(player);

            } else
            {
                // Three Skips //Disconnect //tabout  
                if(player.finalTurnTimeout != null)
                    clearTimeout(player.finalTurnTimeout);

                this.table.addToPermaLeft(player);
                await this.table.handleDeclare(player, player.cardFormationString);
            }
          
        } else
        {
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
                    this.table.addToPermaLeft(player);

                CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.LEFT);
                player.result = "left";

                
            }
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