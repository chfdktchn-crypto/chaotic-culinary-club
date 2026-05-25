from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import anthropic
import os
import re

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

app = FastAPI(title="Chef-AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    max_age=3600,
)


class RecipeRequest(BaseModel):
    ingredients: list[str]
    cuisine: str | None = None
    max_time: int | None = 30
    servings: int = 2


def parse_recipe(text):
    title = ""
    ingredients = []
    steps = []

    title_match = re.search(r"title:\s*(.+?)(?=\n|ingredients:)", text, re.IGNORECASE)
    if title_match:
        title = title_match.group(1).strip()

    ing_match = re.search(r"ingredients:\s*\n(.*?)(?=\nmethod:|\ndirections:|\nsteps:)", text, re.IGNORECASE | re.DOTALL)
    if ing_match:
        raw = ing_match.group(1).strip()
        lines = [re.sub(r"^[-•*]\s*", "", line).strip() for line in raw.split("\n") if line.strip()]
        ingredients = [re.sub(r"\s+\d+$", "", line) for line in lines]

    steps_match = re.search(r"(?:method|directions|steps):\s*\n(.*?)$", text, re.IGNORECASE | re.DOTALL)
    if steps_match:
        raw = steps_match.group(1).strip()
        step_list = re.split(r"\n\d+\.\s+|\n", raw)
        steps = [re.sub(r"^\d+\.\s*", "", s).strip() for s in step_list if len(s.strip()) > 10]
        steps = [s for s in steps if not re.match(r"^directions\s*\d*\.?$", s, re.IGNORECASE)]

    if not title:
        title = "Your Recipe"
    if not ingredients and not steps:
        steps = [text]

    return {"title": title, "ingredients": ingredients, "steps": steps}


@app.post("/generate")
async def generate(req: RecipeRequest):
    if not req.ingredients:
        raise HTTPException(status_code=422, detail="At least one ingredient is required.")

    prompt = f"""You are a professional recipe writer. Generate a clear, accurate recipe using these ingredients: {', '.join(req.ingredients)}.
{"Cuisine style: " + req.cuisine + "." if req.cuisine else ""}
{"Maximum cooking time: " + str(req.max_time) + " minutes." if req.max_time else ""}
Servings: {req.servings}.

Rules:
- Use proper units (teaspoon, tablespoon, cup, pound, etc.)
- Use plurals correctly (1 egg, 2 eggs, 1 dash, 2 dashes)
- Write time ranges with a hyphen (8-10 minutes, not 8 10 minutes)
- Do NOT include the words "cook time", "preparation time", or "directions" anywhere in the recipe
- Each method step should be one clear action only
- Do not add any text before or after the recipe

Format your response exactly like this with no deviations:
Title: [recipe name]

Ingredients:
- [quantity] [ingredient]
- [quantity] [ingredient]

Method:
1. [step]
2. [step]
"""

    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )

    text = message.content[0].text
    parsed = parse_recipe(text)
    parsed["base_servings"] = req.servings
    return {**parsed, "model": "claude-sonnet-4"}


@app.get("/")
async def root():
    return {"status": "Chef-AI API ready", "model": "claude-sonnet-4"}
