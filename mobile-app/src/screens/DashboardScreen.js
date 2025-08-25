// src/screens/DashboardScreen.js
import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BarChart } from 'react-native-chart-kit';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const screenWidth = Dimensions.get('window').width;
const PRIMARY = '#4A90E2';
const CARD_BG = '#FFFFFF';
const BG = '#F2F2F7';
const INCOME = '#2ecc71';
const EXPENSE = '#e74c3c';

export default function DashboardScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({ income: 0, expenses: 0, net: 0 });

  // Sample fallback
  const sampleTxns = [
    { id: '1', category: 'Groceries', amount: -43.58, date: '6/1/2025' },
    { id: '2', category: 'Salary', amount: 1500.0, date: '6/1/2025' },
    { id: '3', category: 'Utilities', amount: -125.72, date: '5/31/2025' },
    { id: '4', category: 'Freelance', amount: 320.0, date: '5/29/2025' },
    { id: '5', category: 'Dining Out', amount: -56.99, date: '5/29/2025' },
  ];

  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('authToken');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch('http://192.168.50.229:5000/api/transactions', { headers });
        const payload = res.ok ? await res.json() : null;
        const data = Array.isArray(payload?.transactions)
          ? payload.transactions
          : sampleTxns;

        // summarize
        let inc = 0, exp = 0;
        data.forEach(t => {
          if (t.amount >= 0) inc += t.amount;
          else exp += Math.abs(t.amount);
        });

        setTransactions(data);
        setSummary({ income: inc, expenses: exp, net: inc - exp });
      } catch {
        // fallback
        setTransactions(sampleTxns);
        let inc = 0, exp = 0;
        sampleTxns.forEach(t => {
          if (t.amount >= 0) inc += t.amount;
          else exp += Math.abs(t.amount);
        });
        setSummary({ income: inc, expenses: exp, net: inc - exp });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const chartData = {
    labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    datasets: [
      { data: [200,350,280,420,150,300,500], color: () => INCOME },
      { data: [150,200,300,180,220,100,250], color: () => EXPENSE },
    ],
    legend: ['Income','Expenses'],
  };

  const renderTxn = ({ item }) => {
    const isExp = item.amount < 0;
    return (
      <TouchableOpacity
        style={styles.txnCard}
        onPress={() => navigation.navigate('EditTransactionScreen', { id: item.id })}
      >
        <View style={styles.txnRow}>
          <MaterialIcons
            name={isExp ? 'arrow-downward' : 'arrow-upward'}
            size={20}
            color={isExp ? EXPENSE : INCOME}
          />
          <Text style={styles.txnCat}>{item.category}</Text>
          <Text style={[styles.txnAmt, isExp ? styles.expense : styles.income]}>
            {(isExp ? '-' : '+')}${Math.abs(item.amount).toFixed(2)}
          </Text>
        </View>
        <Text style={styles.txnDate}>{item.date}</Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* SUMMARY CARDS */}
        <View style={styles.summaryRow}>
          {[
            { key:'income',   label:'Income',   icon:'attach-money' },
            { key:'expenses', label:'Expenses', icon:'money-off'   },
            { key:'net',      label:'Net',      icon:'account-balance' },
          ].map(card => (
            <View key={card.key} style={styles.summaryCard}>
              <MaterialIcons name={card.icon} size={28} color={PRIMARY} />
              <Text style={styles.summaryLabel}>{card.label}</Text>
              <Text style={[
                styles.summaryValue,
                card.key === 'net'
                  ? summary.net>=0 ? styles.income : styles.expense
                  : styles[card.key]
              ]}>
                {card.key==='net' && summary.net<0 ? '-' : ''}
                ${Math.abs(summary[card.key]).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>

        {/* QUICK NAV */}
        <View style={styles.quickNavRow}>
          <TouchableOpacity
            style={styles.quickNavBtn}
            onPress={() => navigation.navigate('CategoryInsights')}
          >
            <MaterialIcons name="pie-chart" size={20} color="#fff" />
            <Text style={styles.quickNavTxt}>Insights</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickNavBtn}
            onPress={() => navigation.navigate('MonthlySummary')}
          >
            <MaterialIcons name="date-range" size={20} color="#fff" />
            <Text style={styles.quickNavTxt}>Summary</Text>
          </TouchableOpacity>

          <TouchableOpacity
          style ={styles.quickNavBtn}
          onPress={()=>
            navigation.navigate('TransactionScreen')
          }>
            <Ionicons name="add-circle-outline" size={20}
            color="#fff"/>
            <Text style={styles.quickNavTxt}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* BAR CHART */}
        <Text style={styles.sectionTitle}>Last 7 Days</Text>
        <BarChart
          data={chartData}
          width={screenWidth - 32}
          height={200}
          chartConfig={{
            backgroundColor: CARD_BG,
            backgroundGradientFrom: CARD_BG,
            backgroundGradientTo: CARD_BG,
            decimalPlaces: 0,
            color: (opacity=1) => `rgba(74,144,226,${opacity})`,
            labelColor: () => '#666',
          }}
          style={styles.chart}
          fromZero
          showValuesOnTopOfBars
        />

        {/* RECENT TRANSACTIONS */}
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        <FlatList
          data={transactions.slice(0,5)}
          keyExtractor={t => t.id.toString()}
          renderItem={renderTxn}
          scrollEnabled={false}
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('TransactionScreen')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex:1, backgroundColor: BG },
  header: {
    flexDirection:'row',
    alignItems:'center',
    backgroundColor: PRIMARY,
    padding:16,
  },
  headerTitle: {
    flex:1,
    color:'#fff',
    fontSize:20,
    fontWeight:'600',
    textAlign:'center',
  },

  container: { flex:1, paddingHorizontal:16 },

  summaryRow: {
    flexDirection:'row',
    justifyContent:'space-between',
    marginTop:16,
  },
  summaryCard: {
    flex:1,
    backgroundColor:CARD_BG,
    borderRadius:12,
    padding:12,
    marginHorizontal:4,
    alignItems:'center',
    ...Platform.select({
      ios:{
        shadowColor:'#000',
        shadowOpacity:0.05,
        shadowOffset:{width:0,height:1},
        shadowRadius:2,
      },
      android:{ elevation:2 },
    }),
  },
  summaryLabel: { marginTop:8, fontSize:14, color:'#666' },
  summaryValue: { marginTop:4, fontSize:18, fontWeight:'600' },

  quickNavRow: {
    flexDirection:'row',
    justifyContent:'space-around',
    marginTop:24,
  },
  quickNavBtn: {
    flexDirection:'row',
    alignItems:'center',
    backgroundColor:PRIMARY,
    paddingVertical:8,
    paddingHorizontal:12,
    borderRadius:20,
  },
  quickNavTxt: { color:'#fff', marginLeft:6, fontWeight:'500' },

  sectionTitle: {
    marginTop:24,
    marginBottom:8,
    fontSize:16,
    fontWeight:'600',
    color:'#333',
  },
  chart: { borderRadius:12 },

  txnCard: {
    backgroundColor:CARD_BG,
    borderRadius:8,
    padding:12,
    marginBottom:12,
    ...Platform.select({
      ios:{
        shadowColor:'#000',
        shadowOpacity:0.03,
        shadowOffset:{width:0,height:1},
        shadowRadius:2,
      },
      android:{ elevation:1 },
    }),
  },
  txnRow:{ flexDirection:'row', alignItems:'center' },
  txnCat:{ flex:1, marginLeft:8, fontSize:15, fontWeight:'500', color:'#333' },
  txnAmt:{ fontSize:15, fontWeight:'600' },
  income:{ color:INCOME },
  expense:{ color:EXPENSE },
  txnDate:{ marginTop:6, fontSize:12, color:'#999' },

  fab: {
    position:'absolute',
    bottom:24,
    right:24,
    backgroundColor:PRIMARY,
    width:56,
    height:56,
    borderRadius:28,
    justifyContent:'center',
    alignItems:'center',
    ...Platform.select({
      ios:{
        shadowColor:'#000',
        shadowOpacity:0.2,
        shadowOffset:{width:0,height:2},
        shadowRadius:4,
      },
      android:{ elevation:4 },
    }),
  },
});
