
import fetch from 'node-fetch';

async function checkDistribution() {
    try {
        const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/price');
        const prices = await res.json();
        
        let countUnder0_9 = 0;
        let count0_9To7 = 0;
        let countOver7 = 0;
        let total = 0;

        prices.forEach(p => {
            if (p.symbol.endsWith('USDT')) {
                const price = parseFloat(p.price);
                if (price < 0.9) countUnder0_9++;
                else if (price <= 7) count0_9To7++;
                else countOver7++;
                total++;
            }
        });

        console.log(`Total USDT Trading Pairs: ${total}`);
        console.log(`Under 0.9 USDT: ${countUnder0_9} (${((countUnder0_9/total)*100).toFixed(1)}%)`);
        console.log(`Between 0.9 and 7 USDT: ${count0_9To7} (${((count0_9To7/total)*100).toFixed(1)}%)`);
        console.log(`Total in your range (≤ 7 USDT): ${countUnder0_9 + count0_9To7} (${(((countUnder0_9 + count0_9To7)/total)*100).toFixed(1)}%)`);
        console.log(`Above 7 USDT: ${countOver7} (${((countOver7/total)*100).toFixed(1)}%)`);
    } catch (e) {
        console.error(e);
    }
}

checkDistribution();
