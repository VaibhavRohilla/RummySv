export const GamesappGameId = "2";
import { Table } from "../server";
import { ServerState } from "./DataTypes";


//moved tokens
//three six
//turn skipped
//no valid move
//all tokens in already

export const ServerID = process.env.SERVERID ? process.env.SERVERID : "GS0";
export const TableTypeId = parseInt(process.env.TABLETYPEID ? process.env.TABLETYPEID : "2");

export function getServerState() {

    if (Table) {

        if (Table.gameInStartProcess) {
            return ServerState.IN_GAME;
        } else {
            // if(isReserved) {
            //     return ServerState.RESERVED;
            // } else
            //
            if (Table.currentPlayersCount > 0) {
                return ServerState.MATCHMAKING;
            } else {
                return ServerState.ONLINE;
            }
        }
    }
    return null;
}

export enum ErrorCode {
    NULL = "Ez0000",
    FULL_TABLE = "Ez0001",
	PLAYER_AS_NULL = "Ez0002",
	GAME_STARTED = "Ez0003",
	INSUFFICIENT_BALANCE = "Ez0004",
}

export enum ErrorMessage
{
	InsufficientBalance = "InsufficientBalance",
	UnableToJoin = `Unable to join table` ,
}




export enum GAMEENDCONDITION {

    MOVTOKEN = "moveToken",
    THREESIX = "threeSix",
    TURNSKIPPED = "turnSkipped",
    NOVALIDMODE = "noValidMove",
    ALLTOKENSIN = "allTokensIn",
    ALLOPPONENTLEFT = "allOpponentLeft",
    ALLLEFTBEFORESTART = "allLeftBeforeStart",
    OPPONENTINVALIDDECLARE = "OPPONENTINVALIDDECLARE"
}






export interface GameEndReport
{
	tableId: string,
    gameRoundId: string,
    startTime: Date,
    endTime: string | Date | undefined,
    players: string[],
    waitingPlayers: string[],
    gameData: any,
    result: Result,
    isEndedCleanly: boolean,
    reason: string | undefined,
    entryFees: {
        [index: string]: number
    },
    leftPlayers: {
        [index: string]: string //reason
    }
}


export interface Result
{
   [index : string] : {amount : number, rake : number, lostPoints : number, cards : string[][]} 
}


export enum TxReasons
{
    WIN = "win",
    LOSE = "lose",
    REFUND_NOMATCH = "refund-nomatch",
    REFUND_ERROR = "refund-error",
    REFUND_FORCECLOSED = "refund-forceclosed"
}


export enum RemovePlayerEvent {
	DISCONNECTED,
    LEFT,
    KICKED,
    SWITCHED,
    ERRORED,
    PRELEFT,
    TIMEOUT,
    LEFT_DURING_START
}





export function isValidPureSequence(cards:string[]) {

	//false is less than 3 cards
	if (cards.length < 3)
		return false;

	//false if joker in here
	for (let i = 0; i < cards.length; i++) {

		let cardVal = parseInt(cards[i].split('-')[0])
		let cardType = parseInt(cards[i].split('-')[1])

		if (cardVal == 0 && cardType == 0) {
			//isJoker
			return false;
		}
	}
	let seqType = -1;

	for (let i = 0; i < cards.length; i++) {

		let cardVal = parseInt(cards[i].split('-')[0])
		let cardType = parseInt(cards[i].split('-')[1])

		if (seqType == -1)
			seqType = cardType

		if (cardType != seqType)
			return false

	}

	let aceCards:any = []
	let restCards = []
	for (let i = 0; i < cards.length; i++) {

		let cardVal = parseInt(cards[i].split('-')[0])
		let cardType = parseInt(cards[i].split('-')[1])

		if (cardVal == 1)
			aceCards.push(cards[i])
		else
			restCards.push(cards[i])

	}

	restCards = sortCards(restCards)
	//console.log(aceCards)
	//console.log(restCards)

	let prevCardVal = -1
	for (let i = 0; i < restCards.length; i++) {

		let cardVal = parseInt(restCards[i].split('-')[0])
		let cardType = parseInt(restCards[i].split('-')[1])

		if (prevCardVal == -1) {

			prevCardVal = cardVal

		} else {
			if (cardVal == prevCardVal + 1) {
				prevCardVal = cardVal;
				continue;
			} else {
				return false;
			}

		}

	}

	//Check if there are ace cards then fit it

	if (aceCards.length > 0) {
		let lastCard = restCards[restCards.length - 1]
		let cardVal = parseInt(lastCard.split('-')[0])
		if (cardVal == 13) {
			restCards.push(aceCards.pop())
		}
	}
	if (aceCards.length > 0) {
		let firstCard = restCards[0]
		let cardVal = parseInt(firstCard.split('-')[0])
		if (cardVal == 2) {
			let card = aceCards.pop()
			restCards.splice(0, 0, card)
		}

	}

	//console.log(aceCards)
	//console.log(restCards)

	if (aceCards.length == 0)
		return true;
	else
		return false

}




export function isValidImpureSequence(cards:string[], jokerCardVal:number) {
	//console.log(cards)
	//false is less than 3 cards
	if (cards.length < 3)
		return false;
	let jokers = []
	let withoutJokers = []
	//false if joker in here
	for (let i = 0; i < cards.length; i++) {
		let cardVal = parseInt(cards[i].split('-')[0])
		let cardType = parseInt(cards[i].split('-')[1])
		if (cardVal == 0 || cardVal == jokerCardVal) {
			jokers.push(cards[i]);
		} else {
			withoutJokers.push(cards[i])
		}
	}
	let seqType = -1;
	for (let i = 0; i < withoutJokers.length; i++) {
		let cardVal = parseInt(withoutJokers[i].split('-')[0])
		let cardType = parseInt(withoutJokers[i].split('-')[1])
		if (seqType == -1)
			seqType = cardType
		if (cardType != seqType)
			return false
	}
	let aceCards:any[] = []
	let restCards = []
	for (let i = 0; i < withoutJokers.length; i++) {
		let cardVal = parseInt(withoutJokers[i].split('-')[0])
		let cardType = parseInt(withoutJokers[i].split('-')[1])
		if (cardVal == 1)
			aceCards.push(withoutJokers[i])
		else
			restCards.push(withoutJokers[i])
	}
	restCards = sortCards(restCards)
	//console.log(aceCards)
	//console.log(jokers)
	//console.log(restCards)
	let prevCardVal = -1
	if (aceCards.length > 0) {
		if (restCards.length > 0) {
			let lastCard = restCards[restCards.length - 1]
			let lastCardVal = parseInt(lastCard.split('-')[0])
			let firstCard = restCards[0]
			let firstCardVal = parseInt(firstCard.split('-')[0])
			if (13 - lastCardVal > firstCardVal - 2) {
				//ace card in starting
				restCards.splice(0, 0, aceCards.pop())
			} else {
				//ace card in the end
				restCards.push(aceCards.pop())
			}
		} else {
			restCards.push(aceCards.pop())
		}
	}
	//console.log(restCards)
	let newCards = []
	let jokersNeeded = 0;
	for (let i = 0; i < restCards.length; i++) {
		let cardVal = parseInt(restCards[i].split('-')[0])
		let cardType = parseInt(restCards[i].split('-')[1])
		if (prevCardVal == -1) {
			prevCardVal = cardVal
			newCards.push(restCards[i])
		} else {
			if (cardVal == prevCardVal + 1) {
				prevCardVal = cardVal;
				newCards.push(restCards[i])
			} else {
				if (cardVal == 1) {
					jokersNeeded = 14 - prevCardVal - 1
					prevCardVal = 14;
				} else {
					jokersNeeded = cardVal - prevCardVal - 1
					prevCardVal = cardVal;
				}
				// console.log("jokers need=" + jokersNeeded)
				if(jokersNeeded<0){
					return false;
				}
				while (jokersNeeded > 0) {
					if (jokers.length <= 0)
						return false;
					newCards.push(jokers.pop())
					jokersNeeded--
				}
				newCards.push(restCards[i])
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
		let lastCard = restCards[restCards.length - 1]
		let lastCardVal = parseInt(lastCard.split('-')[0])
			//  if (lastCardVal != 1) {
		let placableJokers = 14 - lastCardVal
	//	console.log(placableJokers)
		while (placableJokers > 0 && jokers.length > 0) {
			newCards.push(jokers.pop())
			placableJokers--;
		}
		//  }
		let firstCard = restCards[0]
		let firstCardVal = parseInt(firstCard.split('-')[0])
			//  if (firstCardVal != 1) {
		placableJokers = firstCardVal - 1
	//	console.log(placableJokers)
		while (placableJokers > 0 && jokers.length > 0) {
			newCards.splice(0, 0, jokers.pop())
			placableJokers--;
		}
	}
	else{
	while (jokers.length > 0) {
			newCards.splice(0, 0, jokers.pop())
		}
	}
	//(newCards)
	if (jokers.length == 0)
		return true //{result: true, cards:newCards}
	else
		return false // {result: false, cards:[]}
	//help with other cards as jokers
}

export function isValidSet(cards: string[], jokerCardVal:number) {

    let setVal = -1;
    if (cards.length < 3 || cards.length > 4) //set can have 3 or 4 cards only
        return false;

let seqTypeIncluded:number[]=[]
    for (let i = 0; i < cards.length; i++) {

        let cardVal = parseInt(cards[i].split('-')[0])
        let cardType = parseInt(cards[i].split('-')[1])

        if (cardVal == 0 && cardType == 0) {
            //isJoker
            continue;
        }
        else if (cardVal == jokerCardVal) {
            //isJoker
            continue
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



function sortCards(cards:string[]) {

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


export class TimeoutKeeper
{
	startTime : number = -1;

	constructor(public delayTime : number, public timeoutRef : any)
	{
		this.startTime = Date.now();	
	}

	get getRemainingTime()
	{
		const elapsed = Date.now() - this.startTime;
		const remainingTime = this.delayTime - elapsed;
		return Math.floor(remainingTime / 1000);
	} 
}	






































































export enum LEAVECASE {
    LEFTWHILEDECLARE,
    LEFTWHILESUBMIT,
    LEFTINGAME,
    LEFTWHILEMATCHING,
	LEFTWHILEDROPPED,
	LEFTWITHPERMALEFT
}

export enum JOINEDCASE {
    JOINEDWHILETOSS,
    JOINEDWHILEGAMESTARTED,
    JOINEDWHILEMATCHMAKING
}


export enum PLAYERSTATE {
    INGAME,
    WAITING,
    DROPPED,
    LEFT
	
}
























export enum GAMESTATE {
    MATCHMAKING,
    STARTING,
    STARTED,
    IN_GAME,
    RESULT,
    ENDED,
    TOSS,
    FINISHING,
    SUBMITING
}

export function ConvertTextToBase64(text : string)
{
	return Buffer.from(text).toString('base64');	
}

export function ConvertBase64ToText(base64 : string)
{
	return Buffer.from(base64, 'base64').toString('ascii');
}














export enum MSGTYPE {
    JOINED = "joined",
    PADD = "pAdd",
    PLEFT = "pLeft",
    PLCARDSMSG = "plCardsMsg",
    JOKERCARDMSG = "jokerCardMsg",
    OPENDECKCARDMSG = "openDeckCardMsg",
    TOSSRESULTMSG = "tossResultMsg",
    CARDPICKCLICKMSG = "cardPickClickMsg",
    CARDPICKRESPONSEMSG = "cardPickResponse",
    CARDDISCARDMSG = "cardDiscardMsg",
    NEXTPLAYERTURNMSG = "nextPlayerTurnMsg",
    FINISHGAMEMSG = "finishGameMsg",
    DECLAREMSG = "declareMsg",
    SUBMITMSG = "submitMsg",
    RESULTMSG = "resultMsg",
    TIMER = "timer",
    // TURNTIMER = "turnTimer",
    TURNSKIPPED = "turnSkipped",
    // GAMESTART = "gameStart",
    // THREESIX = "threeSix",
    // GAMEENDED = "gameEnded",
    // INVALIDMOVE = "invalidMove",
    WAITTIMER = "waitTimer",
    // THREESKIPS = "threeSkips",
    ERROR = "error",
    THREESKIPS = "THREESKIPS",
    GAMESTARTMSG = "GAMESTARTMSG",
    PREJOIN = "plRejoin",
    REJOINED = "rejoined",
    SWITCH_SUCCESS = "SWITCH_SUCCESS"
}

