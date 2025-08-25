// src/screens/TransactionScreen.js
import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import axios from 'axios';
import { BASE_URL } from '../config/config';
import { Ionicons } from '@expo/vector-icons';

const PRIMARY = '#4A90E2';
const BG = '#F2F2F7';

export default function TransactionScreen({ navigation }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState('');

  const handleSubmit = async () => {
    if (!title || !amount || !date) {
      Alert.alert('Error', 'Please fill Title, Amount & Date');
      return;
    }
    try {
      await axios.post(`${BASE_URL}/transactions`, {
        title,
        amount: parseFloat(amount),
        category,
        date,
      });
      Alert.alert('Success', 'Transaction added');
      navigation.goBack();
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not add. Try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Transaction</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS==='ios' ? 'padding' : 'height'}
      >
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Title*"
            placeholderTextColor="#888"
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={styles.input}
            placeholder="Amount*"
            placeholderTextColor="#888"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />
          <TextInput
            style={styles.input}
            placeholder="Category"
            placeholderTextColor="#888"
            value={category}
            onChangeText={setCategory}
          />
          <TextInput
            style={styles.input}
            placeholder="Date (YYYY-MM-DD)*"
            placeholderTextColor="#888"
            value={date}
            onChangeText={setDate}
          />

          <TouchableOpacity style={styles.button} onPress={handleSubmit}>
            <Text style={styles.buttonText}>SAVE</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
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

  container: { flex:1, paddingHorizontal:16 },
  form: {
    backgroundColor:'#fff',
    borderRadius:12,
    padding:16,
    marginTop:24,
    // shadow
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
  input: {
    height:48,
    borderRadius:8,
    backgroundColor:'#F2F2F2',
    paddingHorizontal:12,
    marginBottom:16,
    fontSize:16,
    color:'#333',
  },
  button: {
    height:48,
    borderRadius:8,
    backgroundColor:PRIMARY,
    justifyContent:'center',
    alignItems:'center',
    marginTop:8,
  },
  buttonText: {
    color:'#fff',
    fontSize:16,
    fontWeight:'600',
  },
});
