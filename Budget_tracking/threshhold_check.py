def check_threshhold(budget, category_name, new_amount):

    limits = budget.get('target_limit', {})
    expenses = budget.get('expenses', [])
    limit_ceiling = limits.get(category_name)
    
    if category_name not in limits:
        print("there is no limit set to this category")
        return False

    count = 0
    for items in expenses:
        if items.get('category') == category_name:
            count += items['amount']

    projected_total = count + float(new_amount)

    if projected_total > limit_ceiling:
        print("you are exceeded your limit")
    else:
        print("expense added successfully")         