"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUIT = exports.Card = void 0;
class Card {
    constructor(val, suit) {
        this.val = val;
        this.suit = suit;
        // if (val > 10) {
        //     this.isFaceCard = true
        // }
        this.name = val + "-" + suit;
        // console.log(this.name)
    }
    // isFaceCard!: boolean
    // isJoker!: boolean
    static convertToCard(cardName) {
        const cardData = cardName.split("-");
        return new Card(parseInt(cardData[0]), parseInt(cardData[1]));
    }
}
exports.Card = Card;
var SUIT;
(function (SUIT) {
    SUIT[SUIT["JOKER"] = 0] = "JOKER";
    SUIT[SUIT["S"] = 1] = "S";
    SUIT[SUIT["C"] = 2] = "C";
    SUIT[SUIT["H"] = 3] = "H";
    SUIT[SUIT["D"] = 4] = "D";
})(SUIT = exports.SUIT || (exports.SUIT = {}));
//# sourceMappingURL=Card.js.map