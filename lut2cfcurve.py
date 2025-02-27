from matplotlib import pyplot as plt
import pandas as pd
from pandas import *
import sys, math, os.path, json, datetime, argparse
import numpy as np
from pathlib import Path


global filename
global resolution
global curves
global curveStep
global interpolation

parser = argparse.ArgumentParser(description="A program to convert LUT to CFCURVE")
parser.add_argument("-f", "--filename", help="Filename")
parser.add_argument("-r", "--resolution", nargs="?", default=32, const=32, type=int, metavar='2, 4, 8, 16, 32, 64, 128, 256', choices=[2, 4, 8, 16, 32, 64, 128, 256], help="DEFAULT = 32. Resolution for the curve. This is how detailed the curve should be")
parser.add_argument("-c", "--curves", nargs="?", default=1, const=1, type=int, metavar='1-10', choices=range(1, 11), help="DEFAULT = 1. Number of extra curves to create.")
parser.add_argument("-s", "--curvestep", nargs="?", default=1, const=1, type=int, metavar='1-99', choices=range(1, 100), help="DEFAULT = 1. The percentage curveSteps between the curves.")
parser.add_argument("-i", "--interpolation", nargs="?", default=0, const=0, type=int, metavar='0-100', choices=range(0, 101), help="DEFAULT = 0 (none). The interpolation effort towards a linear curve.")
args = parser.parse_args()

if args.filename:
	print("Processing: " + args.filename)
else:
	parser.print_help()
	sys.exit("No filename specified!")

filename = args.filename
resolution = args.resolution
curves = args.curves
curveStep = args.curvestep
interpolation = args.interpolation

targetDir='cfcurves'
if not os.path.exists(targetDir):
	os.makedirs(targetDir)

if os.path.isfile(filename):
	utcDateTime=datetime.datetime.now(datetime.UTC).replace(microsecond=0).isoformat().replace("+00:00","Z")

	print('Opening file: ' + filename)
	basename = os.path.splitext(os.path.basename(filename))[0]

	#LUT original
	df_lutOrg = pd.read_csv(filename, header=None)
	df_lutOrgLength = len(df_lutOrg.index)
	df_lutOrg.columns=['LUT original (' + str(df_lutOrgLength) + ' points)']
	print('\r\nOriginal LUT data:')
	print(df_lutOrg)
	df_lutOrgMaxVal = df_lutOrg.to_numpy().max()
	print('\r\ndf_lutOrgMaxVal: ',df_lutOrgMaxVal,sep='')

	ax = df_lutOrg.plot(color='#FF0000')

	#LUT thinned out
	#As resolution means points, we have to subtract 1 to get steps instead
	targetSteps=resolution-1

	#Thin out the data
	df_lutThinned=df_lutOrg.rolling(window=10, center=True, min_periods=0, step=round(df_lutOrgLength/targetSteps)).mean()

	df_lutThinned.columns=['Thinned']

	#As thinned out data not start at 0:0 and not end on 255:?, so we need to fix that
	df_lutThinned.loc[0,'Thinned']=0
	df_lutThinned.loc[255,'Thinned']=df_lutOrgMaxVal
	
	df_lutThinnedLength = len(df_lutThinned.index)
	print('\r\nThinned out data to ',df_lutThinnedLength,' rows (target was x',resolution,') rows:',sep='')
	print(df_lutThinned)

	ax = df_lutThinned.plot(color='#0000FF', ax=ax, figsize=(6, 6))

	#LUT linearized
	df_lutThinned['Linear'] = df_lutThinned.iloc[[0, -1]]
	print('\r\nAdded linearized LUT data:')
	#Interpolate all rows to fix missing data
	df_lutThinned=df_lutThinned.interpolate()
	ax = df_lutThinned.plot(color='#D3D3D3', ax=ax, figsize=(6, 6))
	print(df_lutThinned)

	#Create dataframe with index matching df_lutThinned length
	scaled100indexList = []
	for r in range(0, df_lutThinnedLength):
		scaled100indexList.append(round((100/(df_lutThinnedLength-1))*r))

	print('\r\nAdded y column')
	df_lutScaled100 = pd.DataFrame(scaled100indexList, columns=['y'])
	print(df_lutScaled100)

	#Loop and create different curves which have a lower end-point
	for i in range(0, curves):
		pointList = []
		#Define column namnes
		linearColName='Linear #'+str(i)
		scaled100ColName='Org #'+str(i)+', r='+str(resolution)+', c='+str(curves)+', s='+str(curveStep)

		if interpolation > 0:
			straightenedColName='Interpolated #'+str(i)+', r='+str(resolution)+', c='+str(curves)+', s='+str(curveStep)+', i='+str(interpolation)

		#Copy values from Thinned and Linear columns to new columns to be worked with
		df_lutScaled100[linearColName] = df_lutThinned['Linear'].values
		df_lutScaled100[scaled100ColName] = df_lutThinned['Thinned'].values

		#Scale LUT to 0-100
		df_lutThinnedMaxVal = df_lutScaled100.to_numpy().max()
		for index, row in df_lutScaled100.iterrows():
			#Scale to 100
			df_lutScaled100.loc[index,linearColName] = math.ceil((row[linearColName]/(df_lutOrgLength/(100-(curveStep*i)))))
			df_lutScaled100.loc[index,scaled100ColName] = math.ceil((row[scaled100ColName]/(df_lutOrgLength/(100-(curveStep*i*(df_lutOrgLength/df_lutOrgMaxVal))))))

			if interpolation > 0:
				#Interpolate between Linear and orginal curve to be able to straigthen curve
				df_lutScaled100[straightenedColName]=df_lutScaled100[scaled100ColName] * (1 - (interpolation/100)) + df_lutScaled100[linearColName] * (interpolation/100)

			#Append coordinates to list for inserting into jsonObj
			pointList.append([row.iloc[0], math.ceil((row[scaled100ColName]/(df_lutOrgLength/(100-(curveStep*i)))))])
		
		#When interpolation has been done, drop linear column since it isnt needed anymore
		df_lutScaled100.drop(linearColName, axis=1, inplace=True)

		curve = df_lutScaled100[scaled100ColName].to_numpy().max()
		df_lutScaled100Length = len(df_lutScaled100.index)-1	#-1 to get it 0-based
		print('\r\nLUT scaled to 0-100 (' + str(df_lutScaled100Length) + ' points) with max '+ str(curve) + '%')
		print(df_lutScaled100)
		#df_lutThinned.plot(color='#00FF00', ax=ax, figsize=(6, 6))
	
		#Build json for making a cfcurve (CloudFlowCurve)
		print('\r\nBuild a json for making a cfcurve (CloudFlowCurve) at max ' + str(curve) + '%')
		jsonObj = {}
		jsonObj['document_type'] = 'application/vnd.nixps-curve+json'
		jsonObj['functions'] = [{
			'name':'Default',
			'points':pointList,
			'direct':True,
			'zeroThreshold':0,
			'minimumDot':0,
			'minimumDotSmoothLimit':0,
			'keep0At0':True,
			'minimumSystem':False,
			'hundredThreshold':1,
			'maximumDot':1,
			'maximumDotSmoothLimit':1,
			'keep100At100':True,
			'maximumSystem':False
		}]
		jsonObj['birth'] = utcDateTime
		jsonObj['modification'] = utcDateTime

		if interpolation == 0:
			targetFilename = basename + '_' + str(int(curve)) + '.cfcurve'
		else:
			targetFilename = basename + '_' + str(int(curve)) + '_i'+str(interpolation)+'.cfcurve'

		with open(targetDir + '/' + targetFilename, 'w', encoding='utf-8') as f:
#				json.dump(jsonObj, f, ensure_ascii=False, indent='\t', separators=(',', ':\t'))
			jsonStr = json.dumps(jsonObj, ensure_ascii=False, indent='\t', separators=(',', ':\t'))
			jsonStr = jsonStr.replace("True","true")
			jsonStr = jsonStr.replace("False","false")
			f.write(jsonStr)

		print('\r\nOutput cfcurve to: '+ targetDir + '/' + targetFilename, sep='')

		if curve <= (curveStep*i):
			print('\r\nWARNING! Reached minimum possible curve at ',curve,'%\r\nCould only fulfil ', (i+1), ' of ', curves,' specified curves',sep='')
			break

	ax.set_prop_cycle(color=['#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c', '#98df8a','#d62728', '#ff9896', '#9467bd', '#c5b0d5', '#8c564b', '#c49c94','#e377c2', '#f7b6d2', '#7f7f7f', '#c7c7c7', '#bcbd22', '#dbdb8d','#17becf', '#9edae5'])
	ax = df_lutScaled100.plot(x='y', ax=ax, figsize=(6, 6))


	#Plot settings
	ax.axvspan(100, 255, alpha=0.5, color='gray')
	ax.axhspan(100, 255, alpha=0.5, color='gray')
	plt.xlim(0, 255)
	plt.ylim(0, 255)
	plt.show()

else:
	print('Specified file \''+ filename +'\' is not a file')
