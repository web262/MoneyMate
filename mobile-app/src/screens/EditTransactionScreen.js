import React, { useState } from 'react';
import { View, TextInput, Button, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import axios from 'axios';
import { BASE_URL } from '../config/config';

export default function EditTransactionScreen({ route, navigation }) {
  // 1) Unpack params from Dashboard
  const { id, title: t0, amount: a0, category: c0, date: d0 } = route.params;

  // 2) Local state for each field + loading
  const [title, setTitle]       = useState(t0);
  const [amount, setAmount]     = useState(a0.toString());
  const [category, setCategory] = useState(c0);
  const [date, setDate]         = useState(d0);
  const [loading, setLoading]   = useState(false);

  // 3) Validation helper
  const isValid = () => title && !isNaN(parseFloat(amount)) && date.match(/^\d{4}-\d{2}-\d{2}$/);

  // 4) Save handler (PUT)
  const handleSave = async () => {
    if (!isValid()) {
      return Alert.alert('Validation Error', 'Ensure all fields are correct.');
    }
    setLoading(true);
    try {
      await axios.put(`${BASE_URL}/transactions/${id}`, {
        title,
        amount: parseFloat(amount),
        category,
        date
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', 'Unable to update. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // 5) Delete handler (DELETE)
  const handleDelete = () => {
    Alert.alert('Confirm Delete', 'Delete this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await axios.delete(`${BASE_URL}/transactions/${id}`);
            navigation.goBack();
          } catch {
            Alert.alert('Error', 'Unable to delete.');
          } finally {
            setLoading(false);
          }
        }
      }
    ]);
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Title"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={styles.input}
        placeholder="Amount"
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
      />
      <TextInput
        style={styles.input}
        placeholder="Category"
        value={category}
        onChangeText={setCategory}
      />
      <TextInput
        style={styles.input}
        placeholder="Date (YYYY-MM-DD)"
        value={date}
        onChangeText={setDate}
      />

      {loading
        ? <ActivityIndicator />
        : (
          <>
            <Button
              title="Save"
              onPress={handleSave}
              disabled={!isValid()}
            />
            <View style={{ height: 10 }}/>
            <Button
              title="Delete"
              onPress={handleDelete}
              color="red"
            />
          </>
        )
      }
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, padding:20, backgroundColor:'#fff' },
  input:     { borderWidth:1, borderColor:'#ccc', padding:10,
               marginBottom:10, borderRadius:5 }
});
