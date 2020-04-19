import os
import sys
sys.path.append("packages/") # 追加パッケージのインストール先
import datetime
from time import sleep
import json
import logging
import serial
import greengrasssdk

serial_dev='/dev/ttyS0'
device_name = os.environ['AWS_IOT_THING_NAME'] # この環境変数でThing Nameが取得できる
topic = 'data/' + device_name + '/sensor/co2'

# Loggerのセットアップ
logger = logging.getLogger(__name__)
logging.basicConfig(stream=sys.stdout, level=logging.DEBUG)

# Greengrass Core SDK クライアントの作成
client = greengrasssdk.client("iot-data")

# CO2 濃度取得用関数 (from MHZ19)
def mh_z19():
  ser = serial.Serial(serial_dev,
               baudrate=9600,
               bytesize=serial.EIGHTBITS,
               parity=serial.PARITY_NONE,
               stopbits=serial.STOPBITS_ONE,
               timeout=1.0)

  while 1:
    ser.write(b"\xff\x01\x86\x00\x00\x00\x00\x00\x79")
    s = ser.read(9)
    if len(s)!=0 and  s[0].to_bytes(1, 'big') == b"\xff" and s[1].to_bytes(1, 'big') == b"\x86":
      return {'co2': s[2]*256 + s[3]}
    else:
      break

# Main Loop
while 1:
  now = datetime.datetime.now(datetime.timezone.utc)
  now_ymdhms = "{0:%Y/%m/%d %H:%M:%S}".format(now)

  # MHZ19からデータを取得
  value = mh_z19()
  co2 = value["co2"]

  # 取得したCO2データをログ(デバッグ用)
  logging.debug("CO2:" + str(co2) + " ppm")
 
  # CO2濃度をGreengrass経由でPublish
  message = {}
  message['device_name'] = device_name
  message['co2'] = co2
  message['timestamp'] = now_ymdhms
  messageJson = json.dumps(message)

  client.publish(
                topic=topic,
                queueFullPolicy="AllOrException",
                payload=messageJson
  )
 
  sleep(5)

# Lambda Handler (無制限稼働のため呼び出されない)
def handler(event, context):
  return