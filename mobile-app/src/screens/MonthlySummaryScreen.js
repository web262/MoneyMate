// src/screens/MonthlySummaryScreen.js
import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const screenWidth = Dimensions.get('window').width;
const PRIMARY = '#4A90E2';
const BACKGROUND = '#F2F2F7';
const CARD_BG = '#FFFFFF';
const INCOME = '#2ecc71';
const EXPENSE = '#e74c3c';

export default function MonthlySummaryScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    income: 0,
    expenses: 0,
    savings: 0,
  });
  const [chartData, setChartData] = useState(null);

  // SAMPLE
  useEffect(() => {
    // simulate API delay
    setTimeout(() => {
      // sample summary
      const inc = 3200.0;
      const exp = 1450.75;
      setSummary({ income: inc, expenses: exp, savings: inc - exp });

      // sample daily data
      setChartData({
        labels: ['1','5','10','15','20','25','30'],
        datasets: [
          { data: [300, 450, 600, 550, 700, 650, 800], color: () => INCOME },
          { data: [200, 300, 400, 350, 450, 400, 500], color: () => EXPENSE },
        ],
        legend: ['Income','Expenses'],
      });

      setLoading(false);
    }, 800);
  }, []);

  if (loading || !chartData) {
    return (
      <SafeAreaView style={[styles.safe, {justifyContent:'center'}]}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* header */}
      <View style={styles.header}>
        <Ionicons
          name="arrow-back"
          size={24}
          color="#fff"
          onPress={() => navigation.goBack()}
        />
        <Text style={styles.headerTitle}>Monthly Summary</Text>
        <View style={{width:24}}/>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* summary cards */}
        <View style={styles.cardsRow}>
          {[
            { key:'income', label:'Income', value:summary.income, icon:'cash' },
            { key:'expenses', label:'Expenses', value:summary.expenses, icon:'remove-circle' },
            { key:'savings', label:'Savings', value:summary.savings, icon:'savings' },
          ].map((c,i) => (
            <View key={i} style={styles.statCard}>
              <Ionicons name={c.icon} size={28} color={PRIMARY} />
              <Text style={styles.statLabel}>{c.label}</Text>
              <Text
                style={[
                  styles.statValue,
                  c.key==='savings' && c.value<0 ? styles.expense : styles.income,
                ]}
              >
                {c.value<0?'-':''}${Math.abs(c.value).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>

        {/* bar chart */}
        <Text style={styles.title}>Daily Income vs Expenses</Text>
        <BarChart
          data={chartData}
          width={screenWidth - 32}
          height={220}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex:1, backgroundColor: BACKGROUND },
  header: {
    flexDirection:'row',
    alignItems:'center',
    backgroundColor: PRIMARY,
    padding:16,
  },
  headerTitle: {
    flex:1,
    color:'#fff',
    fontSize:18,
    fontWeight:'600',
    textAlign:'center',
  },
  container: {
    alignItems:'center',
    padding:16,
  },
  cardsRow: {
    flexDirection:'row',
    justifyContent:'space-between',
    width:'100%',
    marginBottom:24,
  },
  statCard: {
    flex:1,
    backgroundColor: CARD_BG,
    borderRadius:12,
    padding:12,
    marginHorizontal:4,
    alignItems:'center',
    ...Platform.select({
      ios: {
        shadowColor:'#000',
        shadowOpacity:0.05,
        shadowOffset:{width:0,height:1},
        shadowRadius:2,
      },
      android:{ elevation:2 },
    }),
  },
  statLabel: {
    marginTop:8,
    fontSize:14,
    color:'#666',
  },
  statValue: {
    marginTop:4,
    fontSize:18,
    fontWeight:'600',
  },

  title: {
    fontSize:20,
    fontWeight:'600',
    color:'#333',
    marginBottom:12,
    alignSelf:'flex-start',
  },
  chart: { borderRadius:12 },

  income: { color: INCOME },
  expense:{ color: EXPENSE },
});
