FROM python:3.12-slim

ENV PYTHONUNBUFFERED True
ENV APP_HOME /app
WORKDIR $APP_HOME

# Install dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code and coach data
COPY . ./

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
