// App.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import CategoryInsightsScreen from './src/screens/CategoryInsightsScreen';
import MonthlySummaryScreen from './src/screens/MonthlySummaryScreen';
import TransactionScreen from './src/screens/TransactionScreen';
import EditTransactionScreen from './src/screens/EditTransactionScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{ headerShown: false }} // we draw our own headers
      >
        {/* Authentication */}
        <Stack.Screen
          name="Login"
          component={LoginScreen}
        />

        {/* Main Dashboard */}
        <Stack.Screen
          name="Dashboard"
          component={DashboardScreen}
        />

        {/* Insights & Summary */}
        <Stack.Screen
          name="CategoryInsights"
          component={CategoryInsightsScreen}
        />
        <Stack.Screen
          name="MonthlySummary"
          component={MonthlySummaryScreen}
        />

        {/* Transaction CRUD */}
        <Stack.Screen
          name="TransactionScreen"
          component={TransactionScreen}
          options={{ headerShown: true, title: 'Add Transaction' }}
        />
        <Stack.Screen
          name="EditTransactionScreen"
          component={EditTransactionScreen}
          options={{ headerShown: true, title: 'Edit Transaction' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
