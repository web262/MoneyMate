export function calculateDailyStreak(transactions) {
    const dates = new Set(
        transactions.map(txn =>
            new Date(txn.date).toISOString().split("T")[0]
        )
    );

    const today = new Date();
    let streak = 0;

    for (let i = 0; i < 30; i++) {
        const d = new Date(today);
        d.setDate(today.getDate()-i);
        const key = d.toISOString().split("T")[0];
        if (dates.has(key)) {
            streak++;
        }else{
            break;
        }
    }
    return streak;
}

export function calculateLongestStreak(transactions)
{
    const sortedDates = Array.from(
        new Set(transactions.map(txn =>
            new Date(txn.date).toISOString().split("T")[0]
        ))
    ).sort();

    let longest = 0;
    let current = 1;

    for (let i=1; i < sortedDates.length; i++) {
        const prev = new Date(sortedDates[i-1]);
        const curr = new Date(sortedDates[i]);
        if ((curr-prev) === 24*60*60*1000) {
            current++;
        }else {
            longest = Math.max(longest, current);
            current = 1;
        }
    }

    return Math.max(longest, current);
}

export function
getLastTransactionDate(transactions) {
    if (transactions.length === 0)return null;
    const last = transactions
    .map(txn => new Date(txn.date))
    .reduce((a, b) => (a > b ? a : b));
    return last.toISOString().split("T")[0];
}