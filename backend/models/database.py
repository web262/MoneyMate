import mysql.connector
from mysql.connector import Error

def connect_db():

    try:
        connection = mysql.connector.connect(
            host='localhost',
            user='root',       
            password='not7Th!s',  
            database='finance_app'
        )
        if connection.is_connected():
            print("Successfully connected to the MySQL database.")
            return connection
        else:
            print("Connection was not established.")
            return None
    except Error as e:
        print("Error connecting to MySQL:", e)
        return None
