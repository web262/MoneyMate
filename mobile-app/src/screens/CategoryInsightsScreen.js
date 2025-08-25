// src/screens/CategoryInsightsScreen.js
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
import { PieChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const screenWidth = Dimensions.get('window').width;
const PRIMARY = '#4A90E2';
const BACKGROUND = '#F2F2F7';
const CARD_BG = '#FFFFFF';
const COLORS = [
  '#F44336','#2196F3','#4CAF50','#FF9800',
  '#9C27B0','#00BCD4','#FFC107','#E91E63',
];

export default function CategoryInsightsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);

  // SAMPLE data
  const sample = [
    { name: 'Groceries',   amount: 120.5 },
    { name: 'Dining Out',  amount: 80.0 },
    { name: 'Utilities',   amount: 90.75 },
    { name: 'Entertainment',amount: 50.25 },
    { name: 'Transport',   amount: 40.0 },
  ];

  useEffect(() => {
    // simulate loading
    setTimeout(() => {
      const formatted = sample.map((item, i) => ({
        name: item.name,
        amount: item.amount,
        color: COLORS[i % COLORS.length],
        legendFontColor: '#333',
        legendFontSize: 14,
      }));
      setData(formatted);
      setLoading(false);
    }, 800);
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
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
        <Text style={styles.headerTitle}>Category Insights</Text>
        <View style={{width:24}}/>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Spending by Category</Text>

        <PieChart
          data={data}
          width={screenWidth - 32}
          height={240}
          accessor="amount"
          backgroundColor="transparent"
          paddingLeft="15"
          absolute
          chartConfig={{
            backgroundColor: CARD_BG,
            backgroundGradientFrom: CARD_BG,
            backgroundGradientTo: CARD_BG,
            color: (opacity = 1) => `rgba(0,0,0, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(0,0,0, ${opacity})`,
          }}
          style={styles.chart}
        />

        <View style={styles.legendContainer}>
          {data.map((slice, i) => (
            <View key={i} style={styles.legendRow}>
              <View
                style={[
                  styles.legendColorBox,
                  { backgroundColor: slice.color },
                ]}
              />
              <Text style={styles.legendLabel}>
                {slice.name} — ${slice.amount.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BACKGROUND },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PRIMARY,
    padding: 16,
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  container: {
    alignItems: 'center',
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  chart: { borderRadius: 12 },
  legendContainer: {
    marginTop: 16,
    width: '100%',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  legendColorBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    marginRight: 8,
  },
  legendLabel: { fontSize: 14, color: '#333' },
});
