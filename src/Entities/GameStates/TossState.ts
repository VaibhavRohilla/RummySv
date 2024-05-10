import { CallLeftPlayerAPI } from "../../apicalls";
import { ErrorRequest, KickRequest } from "../../DataTypes";
import { LogMessage } from "../LoggingHandler";
import { Player } from "../Player";
import { TableGameRoom } from "../TableGameRoom";
import { ErrorCode, GAMESTATE, MSGTYPE, PLAYERSTATE, RemovePlayerEvent } from "../Utils";
import { GameState } from "./GameState";


export class TossState extends GameState
{
    
    constructor(table : TableGameRoom)
    {
        super(table, GAMESTATE.TOSS);
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
    

    public override async OnLeaveClicked(player: Player): Promise<void>
    {
        super.OnLeaveClicked(player);
        const oldState = player.playerState;
        //Perform basic leave operations
        this.BasicLeftOperations(player);
       LogMessage("Player state : " + oldState, this.table, player); 
        //check if player has not already charged
            //mark player as lost 
            //add lost points to player

            //charge player for the game if he has not already been charged
                //call player left API after charging player
                //Mark player ready for result calculation
        
        if(oldState == PLAYERSTATE.INGAME && !player.isCharged)
        {

            player.result = "left";
            player.lostPoints = 80;

            this.table.addToPermaLeft(player);
            
            await this.table.handleChargePlayer(player,
                player.lostPoints * this.table.pointsVal,
                "Player Left Game");

            CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.LEFT);
            player.readyForResultCalculation = true;
        } else 
        {
            if(oldState == PLAYERSTATE.DROPPED)
            {
                this.table.addToPermaLeft(player);
            }

            //call player left API
            CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.LEFT);
        }

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
        
        //mark player as disconnected
        player.isDisconnected = true;
        //send message to other players that player's connection is lost
        this.table.sendMessageToAll({
            t : MSGTYPE.PLEFT,
            data : player.plRoomNetId,
            state : player.playerState
        });

        //Call player left API with event as DISCONNECTED
        CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.DISCONNECTED); 
    }

    public override async Kick(player: Player, kickReq: KickRequest): Promise<void>
    {
        super.Kick(player, kickReq);
    
        // throw new Error("Method not implemented.");
       
    }

    public override async Errored(player: Player, errorData: ErrorRequest): Promise<void> {
        super.Errored(player, errorData);

        player.playerState = PLAYERSTATE.LEFT;

        this.UnableToJoinError(player, errorData);
    }
}