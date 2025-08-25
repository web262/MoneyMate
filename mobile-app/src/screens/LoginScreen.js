import React, { useState } from 'react';
import { SafeAreaView, View, Text, TextInput,TouchableOpacity, StyleSheet, Image, KeyboardAvoidingView, Platform, } from 'react-native';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    // You can validate here
    if (email === 'test@example.com' && password === '1234') {
      navigation.navigate('Dashboard');
    } else {
      alert('Invalid credentials');
    }
  };

  return (

    <SafeAreaView style={styles.safeArea}>
      <View style ={styles.header}>
        <Text style={styles.headerText}>
          MyFinanceApp
        </Text>
      </View>

      <KeyboardAvoidingView style={styles.container}
      behavior={Platform.OS==='ios'?'padding' :
        'height'}>
          <View style={styles.form}>
            <Text style={styles.title}>Welcome Back</Text>
  

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#888"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#888"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TouchableOpacity style={styles.button}
      onPress={handleLogin}>
        <Text style={styles.buttonText}>LOGIN</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button}
      onPress={handleLogin}>
        <Text style={styles.linkText}>FORGOT PASSWORD</Text>
      </TouchableOpacity>
       
       {/*FOOTER */}
      <Text style={styles.footer}>Made by Hyun</Text>
    </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const PRIMARY = '#4A90E2';

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: PRIMARY,
  },
  header: {
    height: 60,
    justifyContent:'center',
    alignItems:'center',
    backgroundColor: PRIMARY,

  },
  headerText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },

  container: {
    flex: 1,
  },
  form: {
    flex:1,
    backgroundColor: '#fff',
    marginTop: -20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    justifyContent:'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    height: 48,
    borderRadius:8,
    backgroundColor:'#f2f2f2',
    paddingHorizontal: 16,
    marginBottom: 16,
    fontSize: 16,
    color: '#333',
  },

  button: {
    height: 48,
    borderRadius: 8,
    backgroundColor: PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: {width: 0, height:2},
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkText: {
    color: PRIMARY,
    textAlign: 'center',
    fontSize: 14,
  },
  footer: {
    marginTop: 32,
    textAlign: 'center',
    fontSize: 12,
    color: '#aaa',
  },

});
