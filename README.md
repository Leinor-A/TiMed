# TiMed

**A Goal-Based Intelligent Agent for Medication Adherence with Computer Vision-Based Pill Verification**

TiMed is a mobile application developed as an academic project for CS 403 – Intelligent Agents. It aims to support medication adherence through scheduled reminders, adherence tracking, intelligent agent monitoring, and experimental computer vision-based pill appearance classification.

## Features

- Medication management and reminder scheduling
- Local medication notifications
- Taken and Missed dose recording
- Intelligent agent monitoring of medication schedules and overdue, unconfirmed doses
- Follow-up prompts for unconfirmed doses
- Seven-day adherence pattern analysis
- Medication history and dashboard insights
- Experimental pill appearance classification using MobileNetV3-Small

## Technologies

**Mobile Application**

- React Native
- Expo
- TypeScript
- Expo Router
- SQLite

**Machine Learning Backend**

- Python 3.12
- FastAPI
- PyTorch
- Torchvision
- MobileNetV3-Small

## Project Structure

```text
TiMed/
├── assets/
├── src/
│   ├── app/
│   ├── data/
│   ├── database/
│   └── services/
├── ml-backend/
│   ├── api.py
│   ├── models/
│   ├── requirements.txt
│   └── training and evaluation scripts
├── app.json
├── package.json
└── README.md
```

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/Leinor-A/TiMed.git
cd TiMed
```

### 2. Set Up the Mobile Application

Install the Node.js dependencies:

```bash
npm install
```

Start the Expo development server:

```bash
npx expo start
```

Open the application using Expo Go on a compatible device.

If your network restricts local device connections, try:

```bash
npx expo start --tunnel
```

### 3. Set Up the ML Backend

Open another terminal and navigate to the backend:

```bash
cd ml-backend
```

Create a Python virtual environment:

```bash
python -m venv .venv
```

Activate it in Windows Git Bash:

```bash
source .venv/Scripts/activate
```

Install the dependencies:

```bash
python -m pip install -r requirements.txt
```

Start the FastAPI server:

```bash
python -m uvicorn api:app --host 0.0.0.0 --port 8000
```

The API documentation should be accessible at:

```text
http://localhost:8000/docs
```

The mobile application must be configured to connect to the backend server's reachable network address. `localhost` on a physical phone does not refer to the development laptop.

### 4. Run the Complete System

Keep both development servers running:

- Expo development server for the mobile application
- FastAPI server for the experimental computer vision functionality

The mobile application stores medication and adherence information locally using SQLite.

## Intelligent Agent

TiMed's goal-based agent supports medication adherence by evaluating medication schedules, tracking user-reported dose responses, identifying overdue unconfirmed doses, and analyzing recent adherence patterns.

The current agent primarily uses rule-based decision-making and pattern analysis. Learning-based adherence prediction is a potential future enhancement.

## Computer Vision

The experimental computer vision component uses a MobileNetV3-Small image classification model trained on a limited two-class pill image dataset.

**Important limitations:**

- Image classification results do not confirm a medication's identity.
- The model is not clinically validated.
- Image classification does not prove medication ingestion.
- The application is an academic prototype and is not a substitute for professional medical advice.

## Collaboration

Group members should create separate Git branches when developing features and submit pull requests for review before merging changes into `main`.

## Project Status

Academic prototype under development. Core medication scheduling, adherence tracking, agent monitoring, and experimental computer vision functionality have been implemented. Further testing, evaluation, and refinement are ongoing.
