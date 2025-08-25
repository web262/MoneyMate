export function
detectRecurringTransactions(transactions) {
    const map = {};

    transactions.forEach(txn => {
        const key = '${txn.title}-${txn.amount}';
        const date = newDate(txn.date).toISOString().split("T")[0];
        if(!map[key]) map[key] = new Set();
        map[key].add(date);
    });


    return Object.entries(map)
    .filter(([_, dateSet]) => dateSet.size >= 2)
    .map(([key, dateSet]) => {
        const[title, amountStr] = key.split("-");
        const amount = parseFloat(amountStr);
        const dates = Array.from(dateSet).sort();
        const diffs = [];

        for(let i = 1; i < dates.length; i++) {
            const d1 = new Date (dates[i -1]);
            const d2 = new Date (dates[i]);
            diffs.push((d2 -d1) / (24*60*60*1000));
        }

        const avgInterval = diffs.reduce((a, b) => a + b, 0)/ diffs. length;
        const lastDate = new Date(dates[dates.length - 1]);
        lastDate.setDate(lastDate.getDate() + Math.round(avgInterval));

        return {
            title,
            amount,
            dates,
            nextExpected: lastDate.toISOString().split("T")[0]
        };
    });
}