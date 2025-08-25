import React from 'react';
import { Text, StyleSheet } from 'react-native';


export default function ReadOnlyText({ children, style }) {
    return <Text style = {[StyleSheet.absoluteFill, style]}
    >{children}</Text>;
}

const styles = StyleSheet.create({
    base: {
        fontsize: 16,
        color: '#333',
    },
});