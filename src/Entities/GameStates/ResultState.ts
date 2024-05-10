import { CallLeftPlayerAPI } from "../../apicalls";
import { ErrorRequest, KickRequest } from "../../DataTypes";
import { LogMessage } from "../LoggingHandler";
import { Player } from "../Player";
import { TableGameRoom } from "../TableGameRoom";
import { ErrorCode, GAMESTATE, MSGTYPE, PLAYERSTATE, RemovePlayerEvent } from "../Utils";
import { GameState } from "./GameState";



export class ResultState extends GameState
{
    

    constructor(table : TableGameRoom)
    {
        super(table, GAMESTATE.RESULT);
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

        LogMessage("Player " + player.playerID + " Clicked on leave", this.table, player);
        return; // Not possible as leave button gets disabled on result screen on client side

        // throw new Error("Method not implemented.");
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

        //Inactive Players Kick

        // if(player.isDisconnected)
        {
            if(player.playerState != PLAYERSTATE.LEFT)
                this.BasicLeftOperations(player);

            CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.KICKED);

            this.CloseSocket(player);
        }
        //  else
        // {
        //     LogMessage("Player " + player.playerID + " is not disconnected can't kick", this.table, player);
        // }
    }

    public override async Errored(player: Player, errorData: ErrorRequest): Promise<void>
    {
       super.Errored(player, errorData); 

       player.playerState = PLAYERSTATE.LEFT;

        if(errorData.code == ErrorCode.INSUFFICIENT_BALANCE)
        {
            player.sendMessage({
                t : MSGTYPE.ERROR,
                msg : errorData.msg
            });

            this.BasicLeftOperations(player);

            CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.ERRORED);
        } else
           this.UnableToJoinError(player, errorData);


        this.CloseSocket(player);
    }


}