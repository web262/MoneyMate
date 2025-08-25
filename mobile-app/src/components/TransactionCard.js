import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function TransactionCard({ title, amount, date }) {
    return (
        <View style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.amount}>{amount < 0 ? '-$${-amount}' : '+$${-amount}'}</Text>
            <Text style={styles.date}>{date}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        padding: 12,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        marginBottom: 10,
    },
    title: { fontSize: 16, fontWeight: 'bold' },
    amount: { fontSize: 14, color: 'green' },
    date: { fontSize: 12, color: '#555' }
});